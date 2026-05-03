const { getIoTDACLoudClient } = require('./services/iotda/mqtt-client.js');
const { getCrashDetector } = require('./services/iotda/crash-detector.js');

// 初始化微信云开发
wx.cloud.init({
  env: 'cloud1-d2gydtcvc436f7428'  // 替换为你的云环境ID，如 'test-xxxxx'
});

App({
  onLaunch() {
    // 检查更新
    const updateManager = wx.getUpdateManager();
    updateManager.onCheckForUpdate((res) => {
      if (res.hasUpdate) {
        updateManager.onUpdateReady(() => {
          wx.showModal({
            title: '更新提示',
            content: '新版本已准备好，是否重启应用？',
            success: (res) => {
              if (res.confirm) updateManager.applyUpdate();
            }
          });
        });
      }
    });

    // 初始化本地存储
    if (!wx.getStorageSync('courseSchedule')) {
      wx.setStorageSync('courseSchedule', [[], [], [], [], [], [], []]);
    }

    // 初始化IoTDA MQTT客户端
    this.initIoTDA();
  },

  // 初始化IoTDA服务
  initIoTDA() {
    const iotdaClient = getIoTDACLoudClient();
    const crashDetector = getCrashDetector();

    // 设置碰撞检测回调
    crashDetector.setOnSOS((sosData) => {
      console.log('[App] SOS triggered:', sosData);
    });

    this.globalData.iotdaClient = iotdaClient;
    this.globalData.crashDetector = crashDetector;
  },

  globalData: {
    userInfo: null,
    deviceId: '',
    huaweiConfig: null,
    // 传感器数据（来自IoTDA）
    sensorData: {
      latitude: null,
      longitude: null,
      speed: 0,
      accelerationX: 0,
      accelerationY: 0,
      accelerationZ: 0,
      roll: 0,
      pitch: 0,
      yaw: 0,
      timestamp: null
    },
    // IoTDA连接状态
    iotdaConnected: false
  }
});