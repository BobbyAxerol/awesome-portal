import unittest
from role_credentials import matches,password_bytes,verifier

class TestSCRAM(unittest.TestCase):
 def test_fixed_salt_roundtrip(self):
  value='a'*64;encoded=verifier(value,b'0123456789abcdef')
  self.assertTrue(matches(value,encoded));self.assertFalse(matches('b'*64,encoded))
 def test_random_salts_not_equal(self):
  self.assertNotEqual(verifier('a'*64),verifier('a'*64))
 def test_closed_password_format(self):
  for value in ('a'*63,'a'*65,'é'*64,"a'*64",None):
   with self.assertRaises(ValueError):password_bytes(value)
 def test_malformed_and_unbounded_iterations_denied(self):
  for value in (None,'','SCRAM-SHA-256$999999999999:abc$abc:abc',
   'SCRAM-SHA-256$4096:@@@$abc:abc'):
   self.assertFalse(matches('a'*64,value))

if __name__=='__main__':unittest.main()
