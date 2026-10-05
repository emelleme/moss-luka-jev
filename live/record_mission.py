"""Record a fresh live-Jev run for a scenario and save it to recordings/.

Writes recordings/<scenario>.json in the exact format replay_missions.py and
server.py replay: one row per decision, each with the full observation at
decision time and the live API decision result. The physics stepping mirrors
the server loop (10 substeps per 20 ms tick) so the recording replays
deterministically on the recording machine.

Cost warning: every decision is a real OpenRouter call (~10 per mission,
<<$0.01). The Jev policy enforces 60 calls / $0.25 per process.
"""
import argparse
import json
import sys
import time
from pathlib import Path

from physics import Physics
from policy import Jev, ACTIONS

ROOT = Path(__file__).resolve().parent
INSTRUCTION = 'Pick up the can and put it in the bin.'
SUBSTEPS = 10  # physics.step() calls per tick, matching replay_missions.py's 0.02 s tick


def run(scenario, model_path=None):
    policy = Jev()
    if not policy.key:
        raise SystemExit('No API key. Run configure_api.py first, then restart the server/recorder.')
    physics = Physics(model_path)
    physics.reset(scenario)
    rows = []
    recent = []
    while True:
        if physics.plan:
            for _ in range(SUBSTEPS):
                if physics.step():
                    break
        else:
            observation = physics.observe()
            decision = policy.decide(observation, INSTRUCTION)
            rows.append({'observation': observation, 'decision': decision})
            action = decision['action']
            print(f"[{len(rows):2d}] Jev -> {action:<10} "
                  f"({decision['latency_ms']} ms, cumulative ${policy.cost:.6f})", flush=True)
            if action == 'stop':
                break
            if len(rows) >= 30:
                raise SystemExit('30-action limit reached. Discarding recording.')
            recent = (recent + [action])[-8:]
            repeated = any(recent[-3 * l:][:l] == recent[-3 * l:-2 * l] == recent[-2 * l:-l]
                           for l in (1, 2) if len(recent) >= 3 * l)
            if repeated:
                raise SystemExit(f'Repeated decision loop detected ({action}). Discarding recording.')
            if action in ('clear', 'carry') and not physics.held():
                physics.last_result = 'Rejected ' + action + ': object is not held; retry grasp.'
                continue
            if action in ('clear', 'carry') and not physics.held():
                physics.last_result = 'Rejected ' + action + ': object is not held; retry grasp.'
                continue
            if action == 'release' and (abs(physics.tcp()[0] - physics.bin_target()[0]) > .055
                                        or abs(physics.tcp()[1]) > .075):
                physics.last_result = 'Rejected release: gripper is not above the bin.'
                continue
            try:
                physics.command(action)
            except ValueError as exc:
                physics.last_result = str(exc)
    final = physics.observe()
    print(f"final: in_bin={final['in_bin']} settled={final['settled_in_bin']} "
          f"held={final['held']} contacts={final['finger_contacts']} sim={final['sim_seconds']} s", flush=True)
    if not (final['settled_in_bin'] and not final['held'] and final['finger_contacts'] == 0):
        raise SystemExit('Run did not settle the can in the bin. Discarding recording.')
    return {'scenario': scenario,
            'source': 'Recorded real Jev API decisions; physics replayed locally',
            'rows': rows}


def verify(scenario, recording, model_path=None):
    """Replay the fresh recording offline and require a clean pass."""
    import replay_missions
    from server import Session
    session = Session(replay_missions.OfflinePolicy())
    if model_path:
        session.physics = Physics(model_path)
    session.command({'command': 'reset', 'scenario': scenario})
    # 'run' would re-read recordings/ from disk; wire up the replay state
    # directly from the in-memory recording instead (same fields 'run' sets).
    session.replay_rows = recording['rows']
    session.replay_index = 0
    session.error = None
    session.running = True
    session.mode = 'replay'
    session.last_tick = time.monotonic()
    for _ in range(12000):
        if not session.running:
            break
        session.tick(.02)
    final = session.physics.observe()
    ok = (not session.running and session.error is None
          and final['settled_in_bin'] and not final['held'] and final['finger_contacts'] == 0)
    return ok, session.error


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scenario', choices=['can', 'miss', 'far', 'offset'], default='miss')
    parser.add_argument('--model', type=Path, help='Optional scene MJCF')
    args = parser.parse_args()
    recording = run(args.scenario, args.model.resolve() if args.model else None)
    out = ROOT / 'recordings' / f'{args.scenario}.json'
    if out.is_file():
        backup = Path(f'/tmp/{args.scenario}_original_{time.strftime("%Y%m%d_%H%M%S")}.json')
        backup.write_text(out.read_text())
        print(f'original recording backed up to {backup}')
    raw = json.dumps(recording, indent=2) + '\n'
    tmp = out.with_suffix('.json.tmp')
    tmp.write_text(raw)
    ok, error = verify(args.scenario, json.loads(raw), args.model.resolve() if args.model else None)
    if not ok:
        tmp.unlink(missing_ok=True)
        raise SystemExit(f'Offline replay of the fresh recording failed: {error}')
    tmp.replace(out)
    print(f'recorded {len(recording["rows"])} live decisions -> {out} (offline replay verified, '
          f'0 replay API calls)')


if __name__ == '__main__':
    sys.exit(main())
