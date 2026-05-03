// 云函数名称
const CLOUD_FUNCTION_NAME = 'quickstartFunctions';

// 获取openid的云函数名称
const GET_OPENID_FUNCTION = 'quickstartFunctions';

Page({
  data: {
    mode: 'riding',  // riding | anti-theft
    deviceLocation: null,
    deviceLocationText: '',
    deviceStatus: 'offline',  // offline | stationary | moving
    lastUpdateTime: null,
    alertHistory: [],  // 报警记录
    isAntiTheftMode: false,  // 是否开启防盗模式
    latitude: null,
    longitude: null,
    markers: [],
    moveAlarm: 0  // 最新移动报警状态
  },

  onLoad() {
    // 获取当前位置
    this.getCurrentLocation();
    // 从缓存读取模式
    this.loadModeFromCache();
  },

  onShow() {
    // 启动数据轮询
    if (this.data.isAntiTheftMode) {
      this.startPolling();
    }
  },

  onHide() {
    this.stopPolling();
  },

  // 获取当前位置
  getCurrentLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this.setData({
          latitude: res.latitude,
          longitude: res.longitude
        });
      }
    });
  },

  // 从缓存加载模式
  loadModeFromCache() {
    const savedMode = wx.getStorageSync('antiTheftMode');
    if (savedMode) {
      this.setData({
        mode: savedMode.mode || 'riding',
        isAntiTheftMode: savedMode.mode === 'anti-theft'
      });
    }
  },

  // 切换模式
  switchMode(e) {
    const newMode = e.currentTarget.dataset.mode;
    this.setData({
      mode: newMode,
      isAntiTheftMode: newMode === 'anti-theft'
    });

    // 保存到缓存
    wx.setStorageSync('antiTheftMode', {
      mode: newMode
    });

    // 如果切换到防盗模式，发送命令到设备
    if (newMode === 'anti-theft') {
      this.enableAntiTheft();
      this.startPolling();
      this.requestSubscribeMessage();
    } else {
      this.disableAntiTheft();
      this.stopPolling();
    }

    wx.showToast({
      title: newMode === 'anti-theft' ? '已进入防盗模式' : '已切换到骑行模式',
      icon: 'success'
    });
  },

  // 请求订阅消息授权
  requestSubscribeMessage() {
    wx.requestSubscribeMessage({
      tmplIds: ['YOUR_TEMPLATE_ID'], // 需要在微信公众平台配置
      success: (res) => {
        console.log('订阅消息授权结果:', res);
      },
      fail: (err) => {
        console.error('订阅消息授权失败:', err);
      }
    });
  },

  // 开启防盗模式
  enableAntiTheft() {
    wx.cloud.callFunction({
      name: CLOUD_FUNCTION_NAME,
      data: {
        action: 'setDeviceProperty',
        propertyName: 'antiTheftMode',
        propertyValue: true
      }
    }).then(res => {
      console.log('开启防盗模式:', res.result);
    }).catch(err => {
      console.error('开启防盗模式失败:', err);
    });
  },

  // 关闭防盗模式
  disableAntiTheft() {
    wx.cloud.callFunction({
      name: CLOUD_FUNCTION_NAME,
      data: {
        action: 'setDeviceProperty',
        propertyName: 'antiTheftMode',
        propertyValue: false
      }
    }).then(res => {
      console.log('关闭防盗模式:', res.result);
    }).catch(err => {
      console.error('关闭防盗模式失败:', err);
    });
  },

  // 发送防盗报警到云端并触发通知
  sendAntiTheftAlert(location) {
    wx.cloud.callFunction({
      name: CLOUD_FUNCTION_NAME,
      data: {
        action: 'sendAntiTheftAlert',
        deviceId: wx.getStorageSync('iotdaConfig')?.deviceId,
        latitude: location?.latitude,
        longitude: location?.longitude,
        timestamp: Date.now()
      }
    }).then(res => {
      console.log('防盗报警已发送:', res.result);
    }).catch(err => {
      console.error('防盗报警发送失败:', err);
    });
  },

  // 启动轮询获取设备数据
  startPolling() {
    this.stopPolling();  // 先停止之前的轮询

    this.pollingTimer = setInterval(() => {
      this.fetchDeviceData();
    }, 3000);  // 3秒轮询

    // 立即获取一次
    this.fetchDeviceData();
  },

  // 停止轮询
  stopPolling() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  },

  // 获取设备数据
  fetchDeviceData() {
    wx.cloud.callFunction({
      name: CLOUD_FUNCTION_NAME,
      data: {
        action: 'getDeviceData'
      }
    }).then(res => {
      if (res.result && res.result.success) {
        this.handleDeviceData(res.result.data);
      }
    }).catch(err => {
      console.error('获取设备数据失败:', err);
    });
  },

  // 处理设备数据
  handleDeviceData(data) {
    if (!data) return;

    // 提取设备影子中的属性
    let props = data;
    if (data.shadow && data.shadow[0] && data.shadow[0].reported) {
      props = data.shadow[0].reported.properties || data.shadow[0].reported;
    }

    const latitude = props.latitude;
    const longitude = props.longitude;
    const speed = props.speed || 0;
    const moveAlarm = props.moveAlarm || 0;

    // 更新设备位置
    if (latitude && longitude) {
      this.setData({
        deviceLocation: { latitude, longitude },
        deviceLocationText: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
        lastUpdateTime: new Date().toLocaleTimeString(),
        markers: [{
          id: 1,
          latitude,
          longitude,
          title: '设备位置',
          width: 30,
          height: 30,
          iconPath: '/images/device_marker.png'
        }]
      });

      // 检查是否收到移动报警
      if (moveAlarm === 1 && this.data.moveAlarm !== 1) {
        this.onMoveDetected({ latitude, longitude });
      }

      this.setData({ moveAlarm });

      // 更新设备状态
      if (speed > 1) {
        this.setData({ deviceStatus: 'moving' });
      } else {
        this.setData({ deviceStatus: 'stationary' });
      }
    }
  },

  // 检测到移动
  onMoveDetected(location) {
    // 添加报警记录
    const alert = {
      id: Date.now(),
      time: new Date().toLocaleTimeString(),
      type: 'move',
      message: '检测到设备移动',
      latitude: location.latitude,
      longitude: location.longitude
    };

    const alertHistory = [alert, ...this.data.alertHistory.slice(0, 19)];

    this.setData({ alertHistory });

    // 发送报警通知
    this.sendAntiTheftAlert(location);

    // 播放提示音（如果支持）
    wx.vibrateShort && wx.vibrateShort({ type: 'heavy' });

    // 显示本地通知
    wx.showModal({
      title: '⚠️ 防盗报警',
      content: '检测到设备发生移动！',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  // 查看设备位置（在地图上）
  viewDeviceOnMap() {
    const { deviceLocation } = this.data;
    if (!deviceLocation) {
      wx.showToast({ title: '无法获取设备位置', icon: 'none' });
      return;
    }

    wx.openLocation({
      latitude: deviceLocation.latitude,
      longitude: deviceLocation.longitude,
      name: '设备位置',
      scale: 18
    });
  },

  // 清除报警记录
  clearAlertHistory() {
    this.setData({ alertHistory: [] });
  }
});