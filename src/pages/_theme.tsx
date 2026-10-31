import getSystem from '@/utils/get-system'
const OS = getSystem()

// default theme setting
export const defaultTheme = {
  primary_color: '#22C55E',
  secondary_color: '#FC9B76',
  primary_text: '#102016',
  secondary_text: '#3C3C4399',
  info_color: '#22C55E',
  error_color: '#FF3B30',
  warning_color: '#FF9500',
  success_color: '#06943D',
  background_color: '#F2F8F3',
  font_family: `-apple-system, BlinkMacSystemFont,"Microsoft YaHei UI", "Microsoft YaHei", Roboto, "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji"${
    OS === 'windows' ? ', twemoji mozilla' : ''
  }`,
}

// dark mode
export const defaultDarkTheme = {
  ...defaultTheme,
  primary_color: '#4ADE80',
  secondary_color: '#FF9F0A',
  primary_text: '#F0FDF4',
  background_color: '#101713',
  secondary_text: '#EBEBF599',
  info_color: '#4ADE80',
  error_color: '#FF453A',
  warning_color: '#FF9F0A',
  success_color: '#30D158',
}
