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
    if (this.data.isNavigating && this.data.currentLocation) {
      this.updateNavigation();
    }
  },

  getCurrentLocation() {
    wx.showLoading({ title: '获取位置中...' });
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        wx.hideLoading();
        this.setData({
          currentLocation: {
            latitude: res.latitude,
            longitude: res.longitude
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

  onSearchChange(e) {
    const value = e.detail;
    this.setData({ searchValue: value });

    if (!value || value.length < 2) {
      this.setData({ suggestions: [] });
      return;
    }

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

    this.startNavigation();
  },

  startNavigation() {
    const { currentLocation, destination } = this.data;
    if (!destination) {
      wx.showToast({ title: '请先选择目的地', icon: 'none' });
      return;
    }

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

  _doNavigation(lat, lng, destination) {
    wx.showLoading({ title: '规划路线中...' });
    this._requestDirection('bicycling', lat, lng, destination);
  },

  _requestDirection(mode, lat, lng, destination) {
    wx.request({
      url: `${QQMAP_DIRECTION_URL}/${mode}`,
      data: {
        from: `${lat},${lng}`,
        to: `${destination.latitude},${destination.longitude}`,
        key: QQMAP_KEY
      },
      success: (res) => {
        wx.hideLoading();
        console.log(`路线规划结果(${mode}):`, JSON.stringify(res.data, null, 2));

        const data = res.data;
        if (data && data.status === 0 && data.result && data.result.routes && data.result.routes.length > 0) {
          console.log('准备setData, 路线数量:', data.result.routes.length);
          const route = data.result.routes[0];
          const steps = this.parseRouteSteps(route);

          this.setData({
            route: route,
            routeSteps: steps,
            currentStepIndex: 0,
            isNavigating: true
          });

          console.log('setData已完成, isNavigating:', true);

          // 发送导航指令（异步，不影响后续UI更新）
          try {
            this.sendNavCommand({
              navStatus: 'navigating',
              navDestination: destination.title,
              navLatitude: destination.latitude,
              navLongitude: destination.longitude,
              navInstruction: '开始导航',
              navDistance: 0
            });
          } catch (e) {
            console.error('发送导航指令异常:', e);
          }

          this.startLocationUpdate();
          wx.showToast({ title: '导航开始', icon: 'success' });
        } else if (mode === 'bicycling') {
          console.log('骑行路线规划失败，尝试步行路线...');
          wx.showToast({ title: '骑行路线规划中...', icon: 'none' });
          this._requestDirection('walking', lat, lng, destination);
        } else {
          console.error('路线规划失败，返回数据:', data);
          wx.showToast({ title: '无法规划路线', icon: 'none' });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('路线规划请求失败:', err);
        wx.showToast({ title: '路线规划失败', icon: 'none' });
      }
    });
  },

  parseRouteSteps(route) {
    const steps = [];
    if (!route.steps) return steps;

    // 解码 polyline 得到坐标点数组
    const polyline = this._decodePolyline(route.polyline);
    console.log('解码后的polyline点数:', polyline.length);

    route.steps.forEach(step => {
      if (!step.instruction) return;

      // 从 polyline_idx 获取该 step 的起止点索引
      const idx = step.step_origin_index || 0;
      const endIdx = step.step_destination_index || 0;

      // 取 polyline 中该 step 的坐标
      const stepPolyline = [];
      if (route.polyline && step.polyline_idx && step.polyline_idx.length >= 2) {
        const startP = step.polyline_idx[0];
        const endP = step.polyline_idx[1];
        // polyline 是 [lat, lng, lat, lng, ...] 格式
        // 需要从 route.polyline 中取对应索引的点
        const decodedPolyline = polyline;
        if (decodedPolyline[startP]) {
          stepPolyline.push(decodedPolyline[startP]);
        }
      }

      steps.push({
        instruction: step.instruction,
        distance: step.distance,
        actDesc: step.act_desc || '',
        dirDesc: step.dir_desc || '',
        // 取该step的终点坐标
        lat: stepPolyline.length > 0 ? stepPolyline[0].lat : null,
        lng: stepPolyline.length > 0 ? stepPolyline[0].lng : null,
        rawPolyline: step.polyline_idx
      });
    });
    console.log('解析的steps:', steps.map(s => ({ i: s.instruction, lat: s.lat, lng: s.lng })));
    return steps;
  },

  // 解码腾讯地图polyline（坐标偏移量编码）
  _decodePolyline(encoded) {
    if (!encoded || !Array.isArray(encoded)) return [];

    const points = [];
    let lat = 0, lng = 0;

    for (let i = 0; i < encoded.length; i += 2) {
      if (i === 0) {
        // 第一个点是绝对坐标
        lat = encoded[i] / 1e5;
        lng = encoded[i + 1] / 1e5;
      } else {
        // 后续是偏移量
        lat += encoded[i] / 1e5;
        lng += encoded[i + 1] / 1e5;
      }
      points.push({ lat, lng });
    }
    return points;
  },

  startLocationUpdate() {
    wx.startLocationUpdate({
      success: () => {
        wx.onLocationChange((res) => {
          this.handleLocationChange(res);
        });
      },
      fail: (err) => {
        console.error('开启位置更新失败:', err);
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

  handleLocationChange(location) {
    console.log('handleLocationChange 被调用, isNavigating:', this.data.isNavigating);
    this.setData({
      latitude: location.latitude,
      longitude: location.longitude,
      currentLocationText: `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
    });

    if (this.data.isNavigating) {
      console.log('准备调用updateNavigation');
      this.updateNavigation();
    }
  },

  updateNavigation() {
    console.log('updateNavigation 执行, 当前数据:', {
      routeSteps长度: this.data.routeSteps?.length,
      currentLocation: this.data.currentLocation,
      currentStepIndex: this.data.currentStepIndex,
      destination: this.data.destination
    });
    const { routeSteps, currentLocation, currentStepIndex, destination } = this.data;
    if (!routeSteps || routeSteps.length === 0) {
      console.log('routeSteps为空，跳过');
      return;
    }

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

    if (nextStep) {
      // 始终更新导航指令，不管距离多远
      const instruction = nextStep.instruction || '直行';
      const distance = Math.round(minDist);

      this.sendNavCommand({
        navStatus: 'navigating',
        navInstruction: instruction,
        navDistance: distance
      });

      this.setData({
        currentStepIndex: nextIndex,
        currentInstruction: instruction,
        currentDistance: distance
      });
      console.log('已更新导航指令:', instruction, distance);
    }

    if (currentLocation && destination) {
      const distToDest = this.calculateDistance(
        currentLocation.latitude, currentLocation.longitude,
        destination.latitude, destination.longitude
      );
      if (distToDest < 50) {
        this.stopNavigation('已到达目的地');
      }
    }
  },

  extractDirection(instruction) {
    if (!instruction) return '';
    return instruction;
  },

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
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
      console.error('发送导航指令失败:', err?.message || err);
    });
  },

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

  openInMapApp() {
    const { destination } = this.data;
    if (!destination) return;

    wx.openLocation({
      latitude: destination.latitude,
      longitude: destination.longitude,
      name: destination.title,
      address: destination.address,
      scale: 18
    });
  },

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
