Page({
  data: {
    isTracking: false,
    isPaused: false,
    speed: 0,           // 实时速度 km/h
    avgSpeed: 0,        // 平均速度
    distance: 0,        // 总里程 km
    duration: 0,        // 骑行时长 秒
    calories: 0,        // 卡路里
    altitude: 0,        // 海拔
    latitude: null,     // 当前纬度
    longitude: null,    // 当前经度
    pathPoints: [],     // 轨迹点数组
    startTime: null,    // 开始时间
    timer: null,        // 计时器
    // IoTDA传感器数据
    cloudConnected: false,  // 云端连接状态
    cloudSpeed: 0,          // 云端速度
    cloudLatitude: null,    // 云端纬度
    cloudLongitude: null,  // 云端经度
    accelerationX: 0,      // 加速度X
    accelerationY: 0,      // 加速度Y
    accelerationZ: 0,      // 加速度Z
    roll: 0,               // 横滚角
    pitch: 0,              // 俯仰角
    yaw: 0,                // 偏航角
    magnitude: 0,          // 加速度幅值
    showCloudData: false,   // 是否显示云端数据
    // 导航相关
    navDestination: '',
    navInstruction: '',
    navStatus: 'off',
    // 课程提醒相关
    reminderCourse: null,
    reminderDistance: null,
    reminderMinutes: null,
    // 骑行起始时间（用于忽略头1秒位移）
    rideStartTime: null,
    // 上一次GPS更新时间（用于计算速度）
    lastLocationTime: null,
    lastLat: null,
    lastLon: null
  },

  onShow() {
    this.loadTodayData();
    this.initIoTDA();
    this.initCourseReminder();
  },

  onHide() {
    if (this.data.isTracking && !this.data.isPaused) {
      console.log('后台继续记录');
    }
  },

  onUnload() {
    this.stopTracking();
    this.disconnectCloud();
    this.reminderService && this.reminderService.stop();
  },

  // 初始化IoTDA连接
  initIoTDA() {
    const app = getApp();
    const mqttClient = app.globalData && app.globalData.iotdaClient;

    if (!mqttClient) return;

    // 设置连接状态回调
    mqttClient.setOnConnectionChange((connected, reason) => {
      this.setData({ cloudConnected: connected });
      if (connected) {
        wx.showToast({ title: '云端已连接', icon: 'success' });
      } else {
        console.log('[Index] Cloud disconnected:', reason);
      }
    });

    // 设置传感器数据回调
    mqttClient.setOnSensorData((sensorData) => {
      this.handleCloudSensorData(sensorData);
    });

    // 检查是否已配置设备
    const config = wx.getStorageSync('iotdaConfig');
    if (config && config.deviceId) {
      mqttClient.init(config);
      // 如果未连接，自动触发连接
      if (!mqttClient.getConnectionStatus()) {
        mqttClient.connect();
      } else {
        // 客户端已连接，触发回调更新UI
        this.setData({ cloudConnected: true });
      }
    }
  },

  // 处理云端传感器数据（仅用于IMU和碰撞检测，不用于GPS）
  handleCloudSensorData(data) {
    console.log('[Index] 收到云端传感器数据:', JSON.stringify(data));

    const app = getApp();
    const { crashDetector } = app.globalData;

    // 更新IMU数据显示（如果有云端数据的话）
    // 注意：GPS数据不再从云端获取，只使用手机GPS
    try {
      this.setData({
        cloudSpeed: data?.speed ?? 0,
        accelerationX: data?.accelerationX ?? 0,
        accelerationY: data?.accelerationY ?? 0,
        accelerationZ: data?.accelerationZ ?? 0,
        roll: data?.roll ?? 0,
        pitch: data?.pitch ?? 0,
        yaw: data?.yaw ?? 0,
        // 预格式化字符串，避免WXML中调用方法
        accelerationXText: (data?.accelerationX ?? 0).toFixed(2),
        accelerationYText: (data?.accelerationY ?? 0).toFixed(2),
        accelerationZText: (data?.accelerationZ ?? 0).toFixed(2),
        rollText: (data?.roll ?? 0).toFixed(1),
        pitchText: (data?.pitch ?? 0).toFixed(1),
        yawText: (data?.yaw ?? 0).toFixed(1),
        showCloudData: !!data?.accelerationX // 只有IMU数据时才显示云端状态
      });
      console.log('[Index] setData成功, cloudSpeed:', data?.speed);
    } catch (e) {
      console.error('[Index] setData失败:', e);
    }

    // 更新app全局数据
    app.globalData.sensorData = data;

    // 处理碰撞检测（使用手机GPS定位）
    if (crashDetector && this.data.isTracking) {
      try {
        const result = crashDetector.processAcceleration({
          accelerationX: data.accelerationX,
          accelerationY: data.accelerationY,
          accelerationZ: data.accelerationZ
        });
        this.setData({ magnitude: (result?.magnitude ?? 0).toFixed(2) });
      } catch (e) {
        console.error('[Index] 碰撞检测失败:', e);
      }
    }
  },

  // 从云端数据更新位置
  updateLocationFromCloud(cloudData) {
    const { latitude, longitude, speed } = cloudData;
    const pageData = this.data;

    if (!pageData.isTracking || pageData.isPaused) return;
    if (!latitude || !longitude) return;

    // 计算与上一个点的距离
    const lastPoint = pageData.pathPoints[pageData.pathPoints.length - 1];
    if (!lastPoint) {
      console.log('[Index] 首个轨迹点:', latitude, longitude);
      this.setData({
        latitude,
        longitude,
        pathPoints: [{ latitude, longitude }]
      });
      return;
    }

    const dist = this.calculateDistance(
      lastPoint.latitude, lastPoint.longitude,
      latitude, longitude
    );

    // 过滤漂移（距离小于5米视为GPS漂移）
    if (dist < 0.005) return;

    const newDistance = pageData.distance + dist;
    const newPoints = [...pageData.pathPoints, { latitude, longitude }];

    // 使用云端速度计算
    const currentSpeed = speed > 0 ? speed : 0;
    const avgSpeed = (newDistance / (pageData.duration / 3600)).toFixed(1);

    // 计算卡路里
    const caloriesPerKm = 35;
    const newCalories = Math.floor(newDistance * caloriesPerKm);

    this.setData({
      latitude,
      longitude,
      speed: currentSpeed,
      avgSpeed: avgSpeed > 0 ? avgSpeed : 0,
      distance: parseFloat(newDistance.toFixed(2)),
      calories: newCalories,
      pathPoints: newPoints
    });

    this.saveCurrentData();
  },

  // 连接云端
  connectCloud() {
    const app = getApp();
    const mqttClient = app.globalData.iotdaClient;

    if (mqttClient) {
      mqttClient.connect();
    }
  },

  // 断开云端连接
  disconnectCloud() {
    const app = getApp();
    const mqttClient = app.globalData.iotdaClient;

    if (mqttClient) {
      mqttClient.disconnect();
    }
  },

  // 加载今日历史数据
  loadTodayData() {
    const today = new Date().toDateString();
    const records = wx.getStorageSync('rideRecords') || [];
    const todayRecord = records.find(r => r.date === today);

    if (todayRecord) {
      this.setData({
        distance: todayRecord.distance || 0,
        duration: todayRecord.duration || 0,
        calories: todayRecord.calories || 0
      });
    }
  },

  // 开始骑行
  startRide() {
    if (this.data.isTracking) return;

    // 启动手机GPS定位（5秒更新频率，模拟ESP32）
    this.startLocationUpdate5s();

    this.setData({
      isTracking: true,
      isPaused: false,
      startTime: Date.now(),
      rideStartTime: Date.now(), // 记录骑行开始时间，用于忽略头1秒位移
      duration: 0,
      durationText: '00:00:00',
      // 重置GPS数据，使用手机GPS
      showCloudData: false,
      cloudLatitude: null,
      cloudLongitude: null,
      // 重置GPS计算相关
      lastLocationTime: null,
      lastLat: null,
      lastLon: null,
      distance: 0,
      speed: 0,
      avgSpeed: 0
    });

    this.startTimer();
    wx.showToast({ title: '开始记录', icon: 'success' });
  },

  // 请求定位权限
  requestLocationAuth() {
    wx.showModal({
      title: '需要定位权限',
      content: '请在设置中允许使用位置信息',
      success: (res) => {
        if (res.confirm) wx.openSetting();
      }
    });
  },

  // 启动后台定位（5秒更新频率，模拟ESP32）
  startLocationUpdate() {
    wx.startLocationUpdateBackground({
      success: () => {
        wx.onLocationChange(this.onLocationChange);
      },
      fail: (err) => {
        console.error('后台定位失败', err);
        wx.startLocationUpdate({
          success: () => {
            wx.onLocationChange(this.onLocationChange);
          }
        });
      }
    });
  },

  // 启动定位，5秒更新间隔
  startLocationUpdate5s() {
    wx.startLocationUpdateBackground({
      locationUpdateInterval: 5000, // 5秒
      success: () => {
        console.log('[Index] 定位服务已启动，5秒更新');
        wx.onLocationChange(this.onLocationChange);
      },
      fail: (err) => {
        console.error('[Index] 后台定位失败，尝试普通定位', err);
        wx.startLocationUpdate({
          success: () => {
            console.log('[Index] 普通定位服务已启动');
            wx.onLocationChange(this.onLocationChange);
          },
          fail: (err2) => {
            console.error('[Index] 定位失败', err2);
            wx.showToast({ title: '定位失败', icon: 'none' });
          }
        });
      }
    });
  },

  // 位置变化回调（需用箭头函数保持this指向）
  onLocationChange: function(res) {
    const { latitude, longitude, altitude } = res;
    const data = this.data;

    if (!data.isTracking || data.isPaused) return;

    const now = Date.now();

    // 如果没有上次GPS数据，初始化并记录
    if (data.lastLocationTime === null || data.lastLat === null) {
      this.setData({
        latitude,
        longitude,
        speed: 0, // 初始速度为0，等待下次计算
        pathPoints: [{ latitude, longitude }],
        lastLocationTime: now,
        lastLat: latitude,
        lastLon: longitude
      });
      return;
    }

    // 计算与上一个点的距离
    const dist = this.calculateDistance(data.lastLat, data.lastLon, latitude, longitude);
    const timeDiff = (now - data.lastLocationTime) / 1000; // 秒

    // 忽略骑行开始头1秒的位移（防止手机GPS初始化导致的大位移）
    const timeSinceStart = now - (data.rideStartTime || 0);
    if (timeSinceStart < 1000) {
      console.log('[Index] 忽略头1秒位移');
      // 更新位置和时间但不计入距离
      this.setData({
        latitude,
        longitude,
        speed: 0,
        lastLocationTime: now,
        lastLat: latitude,
        lastLon: longitude
      });
      return;
    }

    // 过滤GPS漂移（距离小于5米且时间间隔太短视为漂移）
    if (dist < 0.005 && timeDiff < 2) {
      console.log('[Index] 过滤GPS漂移');
      return;
    }

    // 计算速度（km/h）：距离(km)/时间(h)
    let currentSpeed = 0;
    if (timeDiff > 0) {
      currentSpeed = ((dist / timeDiff) * 3600).toFixed(1);
    }

    // 更新距离和轨迹
    const newDistance = data.distance + dist;
    const newPoints = [...data.pathPoints, { latitude, longitude }];

    // 计算平均速度（km/h）
    const avgSpeed = data.duration > 0 ? (newDistance / (data.duration / 3600)).toFixed(1) : 0;

    // 计算卡路里（简化公式：体重70kg，MET值约8）
    const caloriesPerKm = 35;
    const newCalories = Math.floor(newDistance * caloriesPerKm);

    this.setData({
      latitude,
      longitude,
      altitude: altitude ? altitude.toFixed(1) : 0,
      speed: currentSpeed,
      avgSpeed: avgSpeed > 0 ? avgSpeed : 0,
      distance: parseFloat(newDistance.toFixed(2)),
      calories: newCalories,
      pathPoints: newPoints,
      // 更新上次GPS数据
      lastLocationTime: now,
      lastLat: latitude,
      lastLon: longitude
    });

    this.saveCurrentData();
  },

  // 计算两点间距离（Haversine公式）单位：km
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  },

  toRad(value) {
    return value * Math.PI / 180;
  },

  // 启动计时器
  startTimer() {
    const timer = setInterval(() => {
      if (!this.data.isPaused) {
        const newDuration = this.data.duration + 1;
        this.setData({
          duration: newDuration,
          durationText: this.formatTime(newDuration)
        });
        this.saveCurrentData();
      }
    }, 1000);
    this.setData({ timer });
  },

  // 暂停/继续
  togglePause() {
    this.setData({ isPaused: !this.data.isPaused });
  },

  // 结束骑行
  stopRide() {
    if (!this.data.isTracking) return;

    wx.showModal({
      title: '结束骑行',
      content: `本次骑行 ${this.data.distance} 公里，消耗 ${this.data.calories} 千卡`,
      success: (res) => {
        if (res.confirm) {
          this.saveRideRecord();
          this.stopTracking();
          this.disconnectCloud();
          wx.showToast({ title: '已保存', icon: 'success' });
        }
      }
    });
  },

  // 停止追踪
  stopTracking() {
    if (this.data.timer) {
      clearInterval(this.data.timer);
    }
    wx.stopLocationUpdate();
    wx.offLocationChange(this.onLocationChange);

    this.setData({
      isTracking: false,
      isPaused: false,
      speed: 0,
      timer: null
    });
  },

  // 保存当前数据（用于恢复）
  saveCurrentData() {
    wx.setStorageSync('currentRide', {
      ...this.data,
      saveTime: Date.now()
    });
  },

  // 保存骑行记录
  saveRideRecord() {
    const records = wx.getStorageSync('rideRecords') || [];
    const today = new Date().toDateString();

    const record = {
      date: today,
      distance: this.data.distance,
      duration: this.data.duration,
      calories: this.data.calories,
      avgSpeed: this.data.avgSpeed,
      pathPoints: this.data.pathPoints,
      endTime: new Date().toISOString()
    };

    // 合并今日数据
    const existingIndex = records.findIndex(r => r.date === today);
    if (existingIndex >= 0) {
      records[existingIndex] = record;
    } else {
      records.push(record);
    }

    wx.setStorageSync('rideRecords', records);
    wx.removeStorageSync('currentRide');

    // 自动生成AI分析报告（异步，不阻塞UI）
    this.autoGenerateAIReport(records);
  },

  // 自动生成AI分析报告
  autoGenerateAIReport(records) {
    if (records.length === 0) return;

    wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: {
        action: 'analyzeRideData',
        rideRecords: records
      },
      success: (res) => {
        console.log('自动AI分析完成:', res);
        if (res.result && res.result.success) {
          const { report, generatedAt } = res.result.data;
          // 更新最新记录的AI报告
          const sorted = records.sort((a, b) => new Date(b.date) - new Date(a.date));
          const latestRecord = sorted[0];
          latestRecord.aiReport = report;
          latestRecord.aiReportGeneratedAt = generatedAt;
          wx.setStorageSync('rideRecords', records);
        }
      },
      fail: (err) => {
        console.error('自动AI分析失败:', err);
      }
    });
  },

  // 查看轨迹地图
  viewMap() {
    if (this.data.pathPoints.length < 2) {
      wx.showToast({ title: '数据不足', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/pages/map/map?points=${JSON.stringify(this.data.pathPoints)}`
    });
  },

  // 前往导航页面
  goToNavigation() {
    wx.navigateTo({
      url: '/pages/navigation/navigation'
    });
  },

  // 格式化时长（秒转为 HH:MM:SS）
  formatTime(seconds) {
    if (!seconds || seconds < 0) return '00:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  },

  // 初始化课程提醒服务
  initCourseReminder() {
    const ReminderService = require('../../services/courseReminder.js');

    this.reminderService = new ReminderService({
      onReminder: (course) => {
        this.setData({
          reminderCourse: course,
          reminderDistance: course.distance,
          reminderMinutes: course.diffMinutes
        });
      },
      onDismiss: () => {
        this.setData({
          reminderCourse: null,
          reminderDistance: null,
          reminderMinutes: null
        });
      }
    });

    this.reminderService.start();
  },

  // 前往导航页面
  goToNavigation() {
    const { reminderCourse } = this.data;

    if (reminderCourse && reminderCourse.latitude && reminderCourse.longitude) {
      // 清除提醒，避免重复提示
      this.reminderService && this.reminderService.clearReminder();

      // 通过URL参数传递目的地
      const destination = {
        title: reminderCourse.locationName || reminderCourse.name,
        address: reminderCourse.address || '',
        latitude: reminderCourse.latitude,
        longitude: reminderCourse.longitude
      };

      const encodedDest = encodeURIComponent(JSON.stringify(destination));
      wx.navigateTo({
        url: `/pages/navigation/navigation?destination=${encodedDest}`
      });
    } else {
      wx.navigateTo({
        url: '/pages/navigation/navigation'
      });
    }
  },

  // 关闭提醒卡片
  dismissReminder() {
    this.reminderService && this.reminderService.clearReminder();
    this.setData({
      reminderCourse: null,
      reminderDistance: null,
      reminderMinutes: null
    });
  },

  // 前往防盗页面
  goToAntiTheft() {
    wx.navigateTo({
      url: '/pages/anti-theft/anti-theft'
    });
  }
});