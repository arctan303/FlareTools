export const TOOL_CATEGORIES = Object.freeze([
  {
    id: 'cross-device',
    titleKey: 'cat_cross_device',
    descriptionKey: 'cat_cross_device_desc',
    icon: 'RadioTower',
    tools: [
      { path: '/share/text', titleKey: 'tool_text_share', descriptionKey: 'tool_text_share_desc', icon: 'ClipboardCopy' },
      { path: '/share/file', titleKey: 'tool_file_transfer', descriptionKey: 'tool_file_transfer_desc', icon: 'FolderSync' },
    ],
  },
  {
    id: 'workspaces',
    titleKey: 'cat_super_workspaces',
    descriptionKey: 'cat_super_workspaces_desc',
    icon: 'Boxes',
    tools: [
      { path: '/dev/transformer', titleKey: 'tool_data_transformer', descriptionKey: 'tool_data_transformer_desc', icon: 'Braces' },
      { path: '/dev/string', titleKey: 'tool_string_processor', descriptionKey: 'tool_string_processor_desc', icon: 'Binary' },
      { path: '/dev/generator', titleKey: 'tool_generator_hub', descriptionKey: 'tool_generator_hub_desc', icon: 'KeyRound' },
    ],
  },
  {
    id: 'focused',
    titleKey: 'cat_specific_tools',
    descriptionKey: 'cat_specific_tools_desc',
    icon: 'ListTree',
    tools: [
      { path: '/dev/color', titleKey: 'tool_color_converter', descriptionKey: 'tool_color_converter_desc', icon: 'Palette' },
      { path: '/security/jwt', titleKey: 'tool_jwt_decoder', descriptionKey: 'tool_jwt_decoder_desc', icon: 'ShieldCheck' },
      { path: '/text/markdown', titleKey: 'tool_markdown_preview', descriptionKey: 'tool_markdown_preview_desc', icon: 'FileCode2' },
      { path: '/text/diff', titleKey: 'tool_text_diff', descriptionKey: 'tool_text_diff_desc', icon: 'GitCompareArrows' },
      { path: '/dev/timestamp', titleKey: 'tool_timestamp_converter', descriptionKey: 'tool_timestamp_converter_desc', icon: 'Clock3' },
      { path: '/tools/qrcode', titleKey: 'tool_qr_generator', descriptionKey: 'tool_qr_generator_desc', icon: 'QrCode' },
    ],
  },
]);

export const ALL_TOOLS = Object.freeze(TOOL_CATEGORIES.flatMap((category) => category.tools));
export const HOME_TOOLS = Object.freeze(TOOL_CATEGORIES.flatMap((category) => (
  category.tools.map((tool) => Object.freeze({
    ...tool,
    categoryId: category.id,
    categoryTitleKey: category.titleKey,
    scopeKey: category.id === 'cross-device' ? 'home_scope_cross_device' : 'home_scope_local',
  }))
)));
export const TOOL_PATHS = Object.freeze(ALL_TOOLS.map((tool) => tool.path));
