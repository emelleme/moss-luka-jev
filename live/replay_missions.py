"""Execute recorded Jev choices in CPU MuJoCo; no credentials or network needed."""
from pathlib import Path
import argparse
import json
import sys
from physics import Physics
from server import Session

ROOT = Path(__file__).resolve().parent


class OfflinePolicy:
    key = ''
    calls = 0
    cost = 0.
    max_calls = 0

    def decide(self, *args):
        raise AssertionError('Offline replay must never request a model decision')


def run(scenario, model_path=None):
    session = Session(OfflinePolicy())
    if model_path:
        session.physics = Physics(model_path)
    session.command({'command': 'reset', 'scenario': scenario})
    session.command({'command': 'run'})
    ticks = 0
    while session.running and ticks < 12000:
        session.tick(.02)
        ticks += 1
    result = session.physics.observe()
    ok = (not session.running and session.error is None
          and result['in_bin'] and result['settled_in_bin']
          and not result['held'] and result['finger_contacts'] == 0
          and session.policy.calls == 0)
    return {'scenario': scenario, 'passed': bool(ok), 'api_calls': session.policy.calls,
            'decisions': session.replay_index, 'error': session.error, 'final': result}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scenario', choices=['all', 'can', 'miss', 'far', 'offset'], default='all')
    parser.add_argument('--model', type=Path, help='Optional scene MJCF, e.g. model/moss_visual.xml')
    parser.add_argument('--output', type=Path, help='Write a JSON result as well as stdout')
    args = parser.parse_args()
    scenes = ('can', 'miss', 'far', 'offset') if args.scenario == 'all' else (args.scenario,)
    results = [run(scene, args.model.resolve() if args.model else None) for scene in scenes]
    report = {'passed': all(r['passed'] for r in results), 'results': results}
    raw = json.dumps(report, indent=2) + '\n'
    print(raw, end='')
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(raw)
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    sys.exit(main())
