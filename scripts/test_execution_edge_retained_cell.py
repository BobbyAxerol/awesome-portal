"""Fake Docker metadata safety tests, no containers or database calls."""
import subprocess
import unittest
from unittest.mock import patch
import execution_edge_retained_cell as m


class Tests(unittest.TestCase):
    def inspect_result(self,code=0,out=b'',err=b''):
        return subprocess.CompletedProcess([],code,out,err)

    def test_known_owner_matches(self):
        with patch.object(m.subprocess,'run',return_value=self.inspect_result(out=m.OWNER.encode())):
            self.assertTrue(m.own_container(m.PG))

    def test_exact_missing_object_is_absent(self):
        with patch.object(m.subprocess,'run',return_value=self.inspect_result(1,err=b'Error: No such object: owned-test')):
            self.assertFalse(m.own_container(m.PG))

    def test_daemon_error_is_not_absence(self):
        with patch.object(m.subprocess,'run',return_value=self.inspect_result(1,err=b'Cannot connect to Docker daemon')):
            with self.assertRaisesRegex(ValueError,'NOT_PROVEN_ABSENT'): m.own_container(m.PG)

    def test_current_docker_lowercase_missing_is_absent(self):
        with patch.object(m.subprocess,'run',return_value=self.inspect_result(1,err=b'error: no such object: owned-test')):
            self.assertFalse(m.own_container(m.PG))

    def test_foreign_owner_must_not_be_removed(self):
        with patch.object(m.subprocess,'run',return_value=self.inspect_result(out=b'foreign')):
            with self.assertRaisesRegex(ValueError,'DO_NOT_TOUCH'): m.own_container(m.PG)

    def test_unlabelled_resource_must_not_be_removed(self):
        with patch.object(m.subprocess,'run',return_value=self.inspect_result(out=b'<no value>')):
            with self.assertRaisesRegex(ValueError,'DO_NOT_TOUCH'): m.own_container(m.PG)

    def test_inspection_never_requests_environment(self):
        with patch.object(m.subprocess,'run',return_value=self.inspect_result(out=m.OWNER.encode())) as run:
            m.own_container(m.PG)
            argv=run.call_args.args[0]
            self.assertEqual(argv[-1],m.PG)
            self.assertNotIn('.Config.Env',' '.join(argv)); self.assertIn(m.LABEL,' '.join(argv))


if __name__=='__main__': unittest.main()
