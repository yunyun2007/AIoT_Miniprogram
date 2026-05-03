/**
 * 华为云IoTDA 配置模块
 * 华东-上海区域
 */

const IOTDA_CONFIG = {
  // Broker地址（华东-上海）
  brokerAddress: 'iotda.cn-east-1.myhuaweicloud.com',
  port: 443,
  path: '/mqtt',

  // Topic模板
  // 设备属性上报: $oc/devices/{device_id}/sys/property/up
  // 设备属性下发: $oc/devices/{device_id}/sys/property/down
  // 命令响应: $oc/devices/{device_id}/sys/command/+/reply
  topic: {
    propertyUp: (deviceId) => `$oc/devices/${deviceId}/sys/property/up`,
    propertyDown: (deviceId) => `$oc/devices/${deviceId}/sys/property/down`,
    commandReply: (deviceId) => `$oc/devices/${deviceId}/sys/command/+/reply`
  },

  // QoS设置
  qos: 1
};

/**
 * 获取存储的IoTDA配置
 */
function getStoredConfig() {
  return wx.getStorageSync('iotdaConfig') || null;
}

/**
 * 保存IoTDA配置到本地
 * @param {Object} config - { deviceId, deviceSecret }
 */
function saveConfig(config) {
  wx.setStorageSync('iotdaConfig', config);
}

/**
 * 清除IoTDA配置
 */
function clearConfig() {
  wx.removeStorageSync('iotdaConfig');
}

/**
 * 检查是否已配置IoTDA
 */
function isConfigured() {
  const config = getStoredConfig();
  return config && config.deviceId && config.deviceSecret;
}

module.exports = {
  IOTDA_CONFIG,
  getStoredConfig,
  saveConfig,
  clearConfig,
  isConfigured
};
