"""Checks for portable model import and unchanged physics after adding visuals."""
from pathlib import Path
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET
import numpy as np
import mujoco
from physics import Physics
from replay_missions import run

ROOT = Path(__file__).resolve().parent


class PortableTests(unittest.TestCase):
    def test_robot_only_loads_at_home(self):
        model = mujoco.MjModel.from_xml_path(str(ROOT/'model/moss_robot.xml'))
        data = mujoco.MjData(model)
        self.assertEqual((model.nq, model.nv, model.nu), (8, 8, 8))
        mujoco.mj_resetDataKeyframe(model, data, model.key('home').id)
        mujoco.mj_forward(model, data)
        self.assertTrue(np.isfinite(data.qpos).all())
        self.assertEqual(mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, 'litter'), -1)
        self.assertEqual(model.nmesh, 57)

    def test_visuals_preserve_inertia_and_control(self):
        base = Physics()
        visual = Physics(ROOT/'model/moss_visual.xml')
        for field in ('body_mass', 'body_inertia', 'body_ipos', 'body_iquat',
                      'jnt_range', 'actuator_ctrlrange', 'actuator_forcerange',
                      'actuator_gainprm', 'actuator_biasprm', 'dof_damping'):
            np.testing.assert_allclose(getattr(base.m, field), getattr(visual.m, field),
                                       rtol=1e-10, atol=1e-12, err_msg=field)
        for i in range(visual.m.ngeom):
            name = mujoco.mj_id2name(visual.m, mujoco.mjtObj.mjOBJ_GEOM, i) or ''
            if name.startswith(('visual_', 'tread_')):
                self.assertEqual(visual.m.geom_contype[i], 0)
                self.assertEqual(visual.m.geom_conaffinity[i], 0)
        for i in range(base.m.ngeom):
            name = mujoco.mj_id2name(base.m, mujoco.mjtObj.mjOBJ_GEOM, i)
            j = visual.m.geom(name).id
            for field in ('geom_type', 'geom_size', 'geom_pos', 'geom_quat',
                          'geom_contype', 'geom_conaffinity', 'geom_friction'):
                np.testing.assert_allclose(getattr(base.m, field)[i], getattr(visual.m, field)[j],
                                           rtol=1e-10, atol=1e-12, err_msg=name+' '+field)

    def test_visual_motion_matches_original(self):
        base = Physics(); visual = Physics(ROOT/'model/moss_visual.xml')
        for action in ('approach', 'align', 'close', 'lift'):
            base.finish(action); visual.finish(action)
            np.testing.assert_allclose(base.d.qpos, visual.d.qpos, atol=1e-8, rtol=0)
        self.assertTrue(visual.held())

    def test_all_visual_replays_offline(self):
        with patch('socket.socket.connect', side_effect=AssertionError('Network forbidden')):
            for scenario in ('can', 'miss', 'far', 'offset'):
                with self.subTest(scenario=scenario):
                    result = run(scenario, ROOT/'model/moss_visual.xml')
                    self.assertTrue(result['passed'], result)
                    self.assertEqual(result['api_calls'], 0)

    def test_mesh_paths_resolve_and_stay_in_package(self):
        for file in ('moss_robot.xml', 'moss_visual.xml', 'moss.xml'):
            path = ROOT/'model'/file
            xml = ET.parse(path).getroot()
            meshdir = xml.find('compiler').get('meshdir', '')
            for mesh in xml.iter('mesh'):
                target = (path.parent/meshdir/mesh.get('file')).resolve()
                self.assertTrue(target.is_relative_to(ROOT))
                self.assertTrue(target.is_file(), str(target))
        urdf = ET.parse(ROOT/'model/so101.urdf')
        self.assertEqual(list(urdf.iter('mesh')), [])


if __name__ == '__main__': unittest.main(verbosity=2)
