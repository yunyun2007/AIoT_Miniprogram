const QQMAP_KEY = 'FI5BZ-ESQKT-SZZXD-LBU6I-JINU2-KYB67';
const QQMAP_DIRECTION_URL = 'https://apis.map.qq.com/ws/direction/v1';

const CLOUD_FUNCTION_NAME = 'quickstartFunctions';

Page({
  data: {
    searchValue: '',
    suggestions: [],
    destination: null,
    currentLocation: null,
    currentLocationText: '',
    route: null,
    routeSteps: [],
    currentStepIndex: 0,
    isNavigating: false,
    currentInstruction: '',
    currentDistance: 0,
    latitude: null,
    longitude: null
  },

  onLoad() {
    this.getCurrentLocation();
  },

  onShow() {
    // 更新导航状态
    if (this.data.isNavigating && this.data.currentLocation) {
      this.updateNavigation();
    }
  },

  // 获取当前位置
  getCurrentLocation() {
    wx.showLoading({ title: '获取位置中...' });
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        wx.hideLoading();
        this.setData({
          currentLocation: {
            latitude: res.latitude,
            longitude: res.longitude,
            currentLocationText: `${res.latitude.toFixed(6)}, ${res.longitude.toFixed(6)}`
          },
          latitude: res.latitude,
          longitude: res.longitude,
          currentLocationText: `${res.latitude.toFixed(6)}, ${res.longitude.toFixed(6)}`
        });
      },
      fail: (err) => {
        wx.hideLoading();
        wx.showToast({ title: '获取位置失败', icon: 'none' });
        console.error('获取位置失败:', err);
      }
    });
  },

  // 搜索输入
  onSearchChange(e) {
    const value = e.detail;
    this.setData({ searchValue: value });

    if (!value || value.length < 2) {
      this.setData({ suggestions: [] });
      return;
    }

    // 关键词搜索（直接调用腾讯地图API）
    wx.request({
      url: 'https://apis.map.qq.com/ws/place/v1/suggestion',
      data: {
        keyword: value,
        region: '全国',
        key: QQMAP_KEY
      },
      success: (res) => {
        console.log('搜索建议:', res.data);
        if (res.data.status === 0) {
          this.setData({ suggestions: res.data.data || [] });
        }
      },
      fail: (err) => {
        console.error('搜索失败:', err);
      }
    });
  },

  // 选择目的地
  onSelectDestination(e) {
    const item = e.currentTarget.dataset.item;
    console.log('选择目的地:', item);

    this.setData({
      destination: {
        title: item.title,
        address: item.address,
        latitude: item.location.lat,
        longitude: item.location.lng
      },
      suggestions: [],
      searchValue: ''
    });

    // 开始导航
    this.startNavigation();
  },

  // 开始导航
  startNavigation() {
    const { currentLocation, destination } = this.data;
    if (!destination) {
      wx.showToast({ title: '请先选择目的地', icon: 'none' });
      return;
    }

    // 如果没有当前位置或位置无效，重新获取
    if (!currentLocation || !currentLocation.latitude || !currentLocation.longitude) {
      wx.showToast({ title: '正在获取位置...', icon: 'none' });
      wx.getLocation({
        type: 'gcj02',
        success: (res) => {
          this.setData({
            currentLocation: {
              latitude: res.latitude,
              longitude: res.longitude
            }
          });
          this._doNavigation(res.latitude, res.longitude, destination);
        },
        fail: () => {
          wx.showToast({ title: '获取位置失败', icon: 'none' });
        }
      });
      return;
    }

    this._doNavigation(currentLocation.latitude, currentLocation.longitude, destination);
  },

  // 执行路线规划
  _doNavigation(lat, lng, destination) {
    wx.showLoading({ title: '规划路线中...' });

    // 骑行路线规划（直接调用腾讯地图API）
    wx.request({
      url: `${QQMAP_DIRECTION_URL}/bicycling`,
      data: {
        from: `${lat},${lng}`,
        to: `${destination.latitude},${destination.longitude}`,
        key: QQMAP_KEY
      },
      success: (res) => {
        wx.hideLoading();
        console.log('路线规划结果:', res.data);

        if (res.data.status !== 0 || !res.data.result || !res.data.result.routes || res.data.result.routes.length === 0) {
          wx.showToast({ title: '无法规划路线', icon: 'none' });
          return;
        }

        const route = res.data.result.routes[0];
        const steps = this.parseRouteSteps(route);

        this.setData({
          route: route,
          routeSteps: steps,
          currentStepIndex: 0,
          isNavigating: true
        });

        // 发送导航开始指令到ESP32
        this.sendNavCommand({
          navStatus: 'navigating',
          navDestination: destination.title,
          navLatitude: destination.latitude,
          navLongitude: destination.longitude,
          navInstruction: '开始导航',
          navDistance: 0
        });

        // 开启位置监听
        this.startLocationUpdate();

        wx.showToast({ title: '导航开始', icon: 'success' });
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('路线规划失败:', err);
        wx.showToast({ title: '路线规划失败', icon: 'none' });
      }
    });
  },

  // 解析路线步骤
  parseRouteSteps(route) {
    const steps = [];
    if (route.steps) {
      route.steps.forEach(step => {
        if (step.instruction) {
          steps.push({
            instruction: step.instruction,
            distance: step.distance,
            lat: step.lat || null,
            lng: step.lng || null
          });
        }
      });
    }
    return steps;
  },

  // 开启位置更新
  startLocationUpdate() {
    wx.startLocationUpdate({
      success: () => {
        wx.onLocationChange((res) => {
          this.handleLocationChange(res);
        });
      },
      fail: (err) => {
        console.error('开启位置更新失败:', err);
        // 尝试后台定位
        wx.startLocationUpdateBackground({
          success: () => {
            wx.onLocationChange((res) => {
              this.handleLocationChange(res);
            });
          }
        });
      }
    });
  },

  // 处理位置变化
  handleLocationChange(location) {
    this.setData({
      latitude: location.latitude,
      longitude: location.longitude,
      currentLocationText: `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
    });

    if (this.data.isNavigating) {
      this.updateNavigation();
    }
  },

  // 更新导航信息
  updateNavigation() {
    const { routeSteps, currentLocation, currentStepIndex, destination } = this.data;
    if (!routeSteps || routeSteps.length === 0) return;

    // 计算到下一个转弯点的距离和方向
    // 这里简化处理，实际应该计算与路线上最近点的距离
    let minDist = Infinity;
    let nextStep = null;
    let nextIndex = currentStepIndex;

    for (let i = currentStepIndex; i < routeSteps.length; i++) {
      const step = routeSteps[i];
      if (step.lat && step.lng && currentLocation) {
        const dist = this.calculateDistance(
          currentLocation.latitude, currentLocation.longitude,
          step.lat, step.lng
        );
        if (dist < minDist) {
          minDist = dist;
          nextStep = step;
          nextIndex = i;
        }
      }
    }

    if (nextStep && minDist < 1000) { // 距离小于1公里时更新
      // 发送导航指令到ESP32
      this.sendNavCommand({
        navStatus: 'navigating',
        navInstruction: this.extractDirection(nextStep.instruction),
        navDistance: Math.round(minDist)
      });

      this.setData({
        currentStepIndex: nextIndex,
        currentInstruction: nextStep.instruction,
        currentDistance: Math.round(minDist)
      });
    }

    // 检查是否到达目的地
    if (currentLocation && destination) {
      const distToDest = this.calculateDistance(
        currentLocation.latitude, currentLocation.longitude,
        destination.latitude, destination.longitude
      );
      if (distToDest < 50) { // 50米内视为到达
        this.stopNavigation('已到达目的地');
      }
    }
  },

  // 提取方向指令
  extractDirection(instruction) {
    if (!instruction) return '';
    // 简化处理，从指令中提取关键方向词
    const directions = ['左转', '右转', '直行', '掉头', '靠左', '靠右'];
    for (const dir of directions) {
      if (instruction.includes(dir)) {
        return instruction;
      }
    }
    return instruction;
  },

  // 计算两点距离（米）
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // 地球半径，单位米
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  toRad(value) {
    return value * Math.PI / 180;
  },

  // 发送导航指令到ESP32
  sendNavCommand(navData) {
    wx.cloud.callFunction({
      name: CLOUD_FUNCTION_NAME,
      data: {
        action: 'setNavCommand',
        ...navData
      }
    }).then(res => {
      console.log('导航指令发送结果:', res.result);
    }).catch(err => {
      console.error('发送导航指令失败:', err);
    });
  },

  // 停止导航
  stopNavigation(reason = '导航结束') {
    wx.stopLocationUpdate();
    wx.offLocationChange();

    this.sendNavCommand({
      navStatus: 'off',
      navInstruction: reason,
      navDistance: 0
    });

    this.setData({
      isNavigating: false,
      currentInstruction: '',
      currentDistance: 0
    });

    wx.showToast({ title: reason, icon: 'success' });
  },

  // 取消导航
  cancelNavigation() {
    wx.showModal({
      title: '取消导航',
      content: '确定要取消导航吗？',
      success: (res) => {
        if (res.confirm) {
          this.stopNavigation('导航已取消');
        }
      }
    });
  },

  // 使用腾讯地图App导航
  openInMapApp() {
    const { destination, currentLocation } = this.data;
    if (!destination) return;

    wx.openLocation({
      latitude: destination.latitude,
      longitude: destination.longitude,
      name: destination.title,
      address: destination.address,
      scale: 18
    });
  },

  // 清除目的地
  clearDestination() {
    this.setData({
      destination: null,
      route: null,
      routeSteps: [],
      currentStepIndex: 0,
      isNavigating: false,
      currentInstruction: '',
      currentDistance: 0
    });
    this.stopNavigation();
  }
});
