import { jwtDecode } from 'jwt-decode';

export function decodeJwt(token) {
  if (!token.trim()) return { error: null, header: '', payload: '' };
  try {
    return {
      error: null,
      header: JSON.stringify(jwtDecode(token, { header: true }), null, 2),
      payload: JSON.stringify(jwtDecode(token), null, 2),
    };
  } catch {
    return { error: 'invalid-token', header: '', payload: '' };
  }
}
