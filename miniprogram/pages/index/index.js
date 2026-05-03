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
    timer: null         // 计时器
  },

  onShow() {
    this.loadTodayData();
  },

  onHide() {
    // 页面隐藏时如果正在骑行，继续后台记录
    if (this.data.isTracking && !this.data.isPaused) {
      console.log('后台继续记录');
    }
  },

  onUnload() {
    this.stopTracking();
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

    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this.setData({
          isTracking: true,
          isPaused: false,
          startTime: Date.now(),
          latitude: res.latitude,
          longitude: res.longitude,
          pathPoints: [{ latitude: res.latitude, longitude: res.longitude }]
        });

        // 启动后台定位
        this.startLocationUpdate();
        // 启动计时器
        this.startTimer();
        
        wx.showToast({ title: '开始记录', icon: 'success' });
      },
      fail: () => {
        this.requestLocationAuth();
      }
    });
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

  // 启动后台定位
  startLocationUpdate() {
    wx.startLocationUpdateBackground({
      success: () => {
        wx.onLocationChange(this.onLocationChange);
      },
      fail: (err) => {
        console.error('后台定位失败', err);
        // 降级为前台定位
        wx.startLocationUpdate({
          success: () => {
            wx.onLocationChange(this.onLocationChange);
          }
        });
      }
    });
  },

  // 位置变化回调（需用箭头函数保持this指向）
  onLocationChange: function(res) {
    const { latitude, longitude, speed, altitude } = res;
    const data = this.data;
    
    if (!data.isTracking || data.isPaused) return;

    // 计算与上一个点的距离
    const lastPoint = data.pathPoints[data.pathPoints.length - 1];
    const dist = this.calculateDistance(
      lastPoint.latitude, lastPoint.longitude,
      latitude, longitude
    );

    // 过滤漂移（距离小于5米视为GPS漂移）
    if (dist < 0.005) return;

    const newDistance = data.distance + dist;
    const newPoints = [...data.pathPoints, { latitude, longitude }];

    // 计算速度（m/s 转 km/h）
    const currentSpeed = speed > 0 ? (speed * 3.6).toFixed(1) : 0;
    const avgSpeed = (newDistance / (data.duration / 3600)).toFixed(1);

    // 计算卡路里（简化公式：体重70kg，MET值约8）
    const caloriesPerKm = 35; // 约35千卡/公里
    const newCalories = Math.floor(newDistance * caloriesPerKm);

    this.setData({
      latitude,
      longitude,
      altitude: altitude ? altitude.toFixed(1) : 0,
      speed: currentSpeed,
      avgSpeed: avgSpeed > 0 ? avgSpeed : 0,
      distance: parseFloat(newDistance.toFixed(2)),
      calories: newCalories,
      pathPoints: newPoints
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
        this.setData({
          duration: this.data.duration + 1
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
  }
});