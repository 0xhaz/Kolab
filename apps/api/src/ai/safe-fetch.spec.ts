import { fetchProductText, isPrivateAddress } from './safe-fetch.js';

describe('isPrivateAddress', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', '::ffff:10.0.0.1'])(
    'blocks %s',
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );
  it.each(['8.8.8.8', '172.32.0.1', '2606:4700::1111'])('allows %s', (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

describe('fetchProductText', () => {
  it('refuses non-http schemes and private hosts without fetching', async () => {
    await expect(fetchProductText('file:///etc/passwd')).resolves.toBeNull();
    await expect(fetchProductText('http://localhost:4010/health')).resolves.toBeNull();
    await expect(fetchProductText('http://169.254.169.254/latest/meta-data')).resolves.toBeNull();
    await expect(fetchProductText('not a url')).resolves.toBeNull();
  });
});
