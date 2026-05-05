import os
import sys
import requests

if len(sys.argv) < 3:
	print('Usage: python upload.py <file_path> <app_url>')
	print('Example: python upload.py data/phd_isr_res_filtered.json https://your-app.up.railway.app')
	sys.exit(1)

file_path = sys.argv[1]
app_url = sys.argv[2].rstrip('/')
admin_key = os.environ.get('ADMIN_KEY', '')

if not admin_key:
	print('Error: ADMIN_KEY environment variable not set')
	sys.exit(1)

if not os.path.exists(file_path):
	print(f'File not found: {file_path}')
	sys.exit(1)

size_mb = os.path.getsize(file_path) / (1024 * 1024)
print(f'Uploading {file_path} ({size_mb:.1f} MB) to {app_url} ...')

with open(file_path, 'rb') as f:
	response = requests.post(
		f'{app_url}/api/admin/upload-results',
		headers={
			'x-admin-key': admin_key,
			'content-type': 'application/json',
		},
		data=f,
		timeout=600,
	)

print(f'Response ({response.status_code}): {response.json()}')
