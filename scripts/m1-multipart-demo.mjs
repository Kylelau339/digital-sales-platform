import { readFile } from 'node:fs/promises';

const [, , baseUrl, archivePath, email, password, csrfToken, cookie] = process.argv;
if (!baseUrl || !archivePath || !email || !password || !csrfToken || !cookie) {
  throw new Error('Usage: node scripts/m1-multipart-demo.mjs <baseUrl> <zipPath> <email> <password> <csrfToken> <cookie>');
}
const archive = await readFile(archivePath);
const json = async (path, body) => {
  const response = await fetch(`${baseUrl}/api/v1${path}`, { method: 'POST', headers: { origin: 'http://localhost:5173', cookie, 'x-csrf-token': csrfToken, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const value = await response.json();
  if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(value)}`);
  return value;
};
const product = await json('/templates', { name: { zh: 'Multipart demo', en: 'Multipart demo' }, summary: { zh: 'demo', en: 'demo' }, category: 'intro', licenseTypes: ['commercial_single_project'], priceUsdCents: 100, version: '1.0.0' });
const version = await json(`/templates/${product.id}/versions`, { version: '1.0.0' });
const session = await json(`/templates/${product.id}/versions/${version.versionId}/upload-session`, { filename: 'demo.zip', contentType: 'application/zip', sizeBytes: archive.byteLength });
const form = new FormData(); form.append('file', new Blob([archive], { type: 'application/zip' }), 'demo.zip');
const upload = await fetch(`${baseUrl}/api/v1/templates/${product.id}/versions/${version.versionId}/files/${session.fileId}/content`, { method: 'POST', headers: { origin: 'http://localhost:5173', cookie, 'x-csrf-token': csrfToken }, body: form });
const uploaded = await upload.json();
const finalized = await json(`/templates/${product.id}/versions/${version.versionId}/files/${session.fileId}/finalize`, {});
console.log(JSON.stringify({ product, version, uploaded, finalized }, null, 2));
