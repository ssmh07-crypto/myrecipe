module.exports = ({ config }) => {
  if (process.env.EXPO_GO_LOCAL !== '1') return config

  return {
    ...config,
    extra: {
      ...config.extra,
      eas: undefined,
    },
  }
}
