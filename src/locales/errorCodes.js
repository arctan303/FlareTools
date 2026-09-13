export const API_ERROR_KEYS = Object.freeze({
  CAPTCHA_REQUIRED: 'api_error_captcha_required',
  CAPTCHA_FAILED: 'api_error_captcha_failed',
  ROOM_CODE_GENERATION_FAILED: 'api_error_room_code_generation_failed',
  INVALID_ROOM_CODE: 'api_error_invalid_room_code',
  ROOM_NOT_FOUND: 'api_error_room_not_found',
  ROOM_FULL: 'api_error_room_full',
  MISSING_PARAMETERS: 'api_error_missing_parameters',
  TEXT_TOO_LONG: 'api_error_text_too_long',
  DEVICE_NOT_IN_ROOM: 'api_error_device_not_in_room',
  FORBIDDEN: 'api_error_forbidden',
  RATE_LIMITED: 'api_error_rate_limited',
  METHOD_NOT_ALLOWED: 'api_error_method_not_allowed',
  UNKNOWN_ACTION: 'api_error_unknown_action',
  INTERNAL_ERROR: 'api_error_internal',
});

export function getApiErrorKey(code) {
  return API_ERROR_KEYS[code] || 'api_error_unknown';
}

export function getApiErrorMessage(response, translate) {
  const key = getApiErrorKey(response?.code);
  const translated = translate(key);
  return translated === key ? translate('api_error_unknown') : translated;
}
