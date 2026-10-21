"""Exercise bootstrap control flow with a fake gcloud; never contacts Google."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('setup-github-deploy.sh').resolve()
MOCK = r'''#!/usr/bin/env python3
import json, os, sys
args = sys.argv[1:]
with open(os.environ['MOCK_LOG'], 'a') as out: out.write(json.dumps(args)+'\n')
mode = os.environ.get('MOCK_MODE','new')
if args[:2] == ['auth','list']: print('' if mode=='unauthenticated' else 'owner@example.com')
elif args[:2] == ['projects','describe']: print('999' if mode=='wrong-project' else '277886772831')
elif args[:3] == ['billing','projects','describe']: print('False' if mode=='no-billing' else 'True')
elif args[:3] == ['iam','service-accounts','list']:
 if mode=='existing': print('github-deploy@mergingsunapp-2.iam.gserviceaccount.com\nmerging-sun-runtime@mergingsunapp-2.iam.gserviceaccount.com\nmergingsunapp-2@appspot.gserviceaccount.com')
 elif mode=='list-fails': sys.exit(1)
elif args[:2] == ['builds','get-default-service-account']: print('277886772831-compute@developer.gserviceaccount.com')
elif args[:3] == ['iam','workload-identity-pools','list'] and mode=='existing': print('projects/277886772831/locations/global/workloadIdentityPools/merging-sun-github')
elif args[:4] == ['iam','workload-identity-pools','providers','list'] and mode=='existing': print('projects/277886772831/locations/global/workloadIdentityPools/merging-sun-github/providers/github')
elif args[:3] == ['artifacts','repositories','list']:
 if mode=='artifact-list-fails': sys.exit(1)
 names = {
  'existing':'projects/mergingsunapp-2/locations/asia-southeast1/repositories/gcf-artifacts',
  'existing-number':'projects/277886772831/locations/asia-southeast1/repositories/gcf-artifacts',
  'existing-short':'gcf-artifacts',
 }
 if mode in names:
  name=names[mode]
  print(name.rsplit('/',1)[-1] if '--format=value(name.basename())' in args else name)
elif args[:3] == ['artifacts','repositories','describe']: print(json.dumps({'cleanupPolicies':{'existing-policy':{'action':'DELETE'}}} if mode=='existing' else {}))
'''

class SetupTests(unittest.TestCase):
    def run_setup(self, mode):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            (root/'gcloud').write_text(MOCK)
            (root/'gcloud').chmod(0o755)
            log=root/'commands.jsonl'
            result=subprocess.run(['bash',str(SCRIPT)],env={**os.environ,'PATH':directory+os.pathsep+os.environ['PATH'],'MOCK_LOG':str(log),'MOCK_MODE':mode},capture_output=True,text=True)
            commands=[json.loads(line) for line in log.read_text().splitlines()]
            return result,commands

    def test_new_project_setup_is_scoped_and_keyless(self):
        result,commands=self.run_setup('new')
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn('Google setup complete',result.stdout)
        flattened='\n'.join(' '.join(c) for c in commands)
        self.assertNotIn('keys create',flattened)
        self.assertNotIn('roles/owner',flattened)
        self.assertNotIn('roles/editor',flattened)
        provider=next(c for c in commands if c[:4]==['iam','workload-identity-pools','providers','create-oidc'])
        condition=next(x for x in provider if x.startswith('--attribute-condition='))
        for required in ['1427839663','345229661','refs/heads/main','.github/workflows/firebase.yml','workflow_dispatch']:
            self.assertIn(required,condition)
        runtime_roles=[c for c in commands if any('serviceAccount:merging-sun-runtime@' in x for x in c) and c[:2]==['projects','add-iam-policy-binding']]
        self.assertEqual(len(runtime_roles),1)
        self.assertIn('--role=roles/datastore.user',runtime_roles[0])

    def test_rerun_preserves_resources_and_existing_cleanup_policy(self):
        result,commands=self.run_setup('existing')
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertFalse(any(c[:3]==['iam','service-accounts','create'] for c in commands))
        self.assertFalse(any(c[:3]==['artifacts','repositories','create'] for c in commands))
        self.assertFalse(any(c[:3]==['artifacts','repositories','set-cleanup-policies'] for c in commands))
        self.assertTrue(any(c[:4]==['iam','workload-identity-pools','providers','update-oidc'] for c in commands))

    def test_preflight_failures_make_no_changes(self):
        for mode in ['unauthenticated','wrong-project','no-billing']:
            with self.subTest(mode=mode):
                result,commands=self.run_setup(mode)
                self.assertNotEqual(result.returncode,0)
                self.assertFalse(any('enable' in c or 'create' in c or 'add-iam-policy-binding' in c for c in commands))

    def test_existing_artifact_repository_name_formats(self):
        for mode in ['existing-number','existing-short']:
            with self.subTest(mode=mode):
                result,commands=self.run_setup(mode)
                self.assertEqual(result.returncode,0,result.stderr)
                self.assertFalse(any(c[:3]==['artifacts','repositories','create'] for c in commands))
                self.assertTrue(any(c[:3]==['artifacts','repositories','set-cleanup-policies'] for c in commands))

    def test_artifact_access_failure_does_not_create_repository(self):
        result,commands=self.run_setup('artifact-list-fails')
        self.assertNotEqual(result.returncode,0)
        self.assertNotIn('Google setup complete',result.stdout)
        self.assertFalse(any(c[:3]==['artifacts','repositories','create'] for c in commands))
        self.assertFalse(any(c[:3]==['artifacts','repositories','set-cleanup-policies'] for c in commands))

    def test_access_failure_is_not_treated_as_absence(self):
        result,commands=self.run_setup('list-fails')
        self.assertNotEqual(result.returncode,0)
        self.assertFalse(any('create' in c or 'add-iam-policy-binding' in c for c in commands))

if __name__=='__main__': unittest.main(verbosity=2)
