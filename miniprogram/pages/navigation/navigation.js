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
    longitude: null,
    // 地图相关
    routePolyline: [],
    markers: []
  },

  onLoad(options) {
    // 如果URL中有destination参数，自动开始导航
    if (options.destination) {
      try {
        const destination = JSON.parse(decodeURIComponent(options.destination));
        console.log('接收到目的地:', destination);

        // 先获取当前位置，然后开始导航
        wx.getLocation({
          type: 'gcj02',
          success: (res) => {
            this.setData({
              currentLocation: {
                latitude: res.latitude,
                longitude: res.longitude
              },
              latitude: res.latitude,
              longitude: res.longitude,
              currentLocationText: `${res.latitude.toFixed(6)}, ${res.longitude.toFixed(6)}`,
              destination: destination
            }, () => {
              this.startNavigation();
            });
          },
          fail: () => {
            this.setData({
              destination: destination,
              currentLocationText: '正在获取位置...'
            });
            wx.showToast({ title: '正在获取位置...', icon: 'none' });
            this.getCurrentLocation();
          }
        });
      } catch (e) {
        console.error('解析destination失败:', e);
        this.getCurrentLocation();
      }
    } else {
      this.getCurrentLocation();
    }
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

          // 解码路线polyline用于地图显示
          const decodedPolyline = this._decodePolyline(route.polyline);

          this.setData({
            route: route,
            routeSteps: steps,
            currentStepIndex: 0,
            isNavigating: true,
            // 地图路线
            routePolyline: [{
              points: decodedPolyline,
              color: '#07c160',
              width: 6,
              dottedLine: false
            }],
            markers: [{
              id: 1,
              latitude: destination.latitude,
              longitude: destination.longitude,
              title: destination.title,
              width: 30,
              height: 30,
              callout: {
                content: destination.title,
                color: '#333',
                fontSize: 14,
                borderRadius: 10,
                padding: 10,
                display: 'ALWAYS',
                bgColor: '#ffffff'
              }
            }]
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
      let lat = null, lng = null;
      if (route.polyline && step.polyline_idx && step.polyline_idx.length >= 2) {
        const startIdx = step.polyline_idx[0];
        const decodedPolyline = polyline;
        if (decodedPolyline[startIdx]) {
          lat = decodedPolyline[startIdx].lat;
          lng = decodedPolyline[startIdx].lng;
        }
      }

      steps.push({
        instruction: step.instruction,
        distance: step.distance,
        actDesc: step.act_desc || '',
        dirDesc: step.dir_desc || '',
        lat: lat,
        lng: lng
      });
    });
    console.log('解析的steps:', steps.map(s => ({ i: s.instruction, lat: s.lat, lng: s.lng })));
    return steps;
  },

  // 解码腾讯地图polyline
  // 格式: [lat1, lng1, dlat2, dlng2, dlat3, dlng3, ...]
  // 第一个点是绝对坐标(度数)，后续是1e-5度的偏移量
  _decodePolyline(encoded) {
    if (!encoded || !Array.isArray(encoded) || encoded.length < 2) return [];

    const points = [];
    // 第一个点是绝对坐标（度数）
    let lat = encoded[0];
    let lng = encoded[1];
    points.push({ lat, lng });

    // 后续是偏移量，每两个值一组
    for (let i = 2; i < encoded.length; i += 2) {
      lat += encoded[i] / 1e5;
      lng += encoded[i + 1] / 1e5;
      points.push({ lat, lng });
    }
    return points;
  },

  startLocationUpdate() {
    const that = this;
    wx.startLocationUpdate({
      success: () => {
        wx.onLocationChange((res) => {
          that.handleLocationChange(res);
        });
      },
      fail: (err) => {
        console.error('开启位置更新失败:', err);
        wx.startLocationUpdateBackground({
          success: () => {
            wx.onLocationChange((res) => {
              that.handleLocationChange(res);
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
      currentLocation: {
        latitude: location.latitude,
        longitude: location.longitude
      },
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
    if (!currentLocation || !currentLocation.latitude || !currentLocation.longitude) {
      console.log('currentLocation无效，先获取位置');
      wx.getLocation({
        type: 'gcj02',
        success: (res) => {
          this.setData({
            currentLocation: {
              latitude: res.latitude,
              longitude: res.longitude
            }
          });
          this._updateNavWithLocation();
        }
      });
      return;
    }

    this._updateNavWithLocation();
  },

  _updateNavWithLocation() {
    const { routeSteps, currentLocation, currentStepIndex, destination } = this.data;
    if (!currentLocation || !currentLocation.latitude || !currentLocation.longitude) return;
    if (!routeSteps || routeSteps.length === 0) return;

    let minDist = Infinity;
    let nextStep = null;
    let nextIndex = currentStepIndex;

    for (let i = currentStepIndex; i < routeSteps.length; i++) {
      const step = routeSteps[i];
      console.log(`step ${i}: lat=${step.lat}, lng=${step.lng}`);
      if (step.lat && step.lng && currentLocation) {
        const dist = this.calculateDistance(
          currentLocation.latitude, currentLocation.longitude,
          step.lat, step.lng
        );
        console.log(`  距离: ${dist}米`);
        if (dist < minDist) {
          minDist = dist;
          nextStep = step;
          nextIndex = i;
        }
      }
    }

    if (nextStep) {
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
    console.log('[Nav] 准备发送导航指令:', JSON.stringify(navData));
    wx.cloud.callFunction({
      name: CLOUD_FUNCTION_NAME,
      data: {
        action: 'setNavCommand',
        ...navData
      }
    }).then(res => {
      console.log('[Nav] 云函数调用成功, result:', JSON.stringify(res.result));
      if (!res.result?.success) {
        console.error('[Nav] 云函数返回错误:', res.result?.error);
      }
    }).catch(err => {
      console.error('[Nav] 发送导航指令失败:', err?.message || err);
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
      currentDistance: 0,
      routePolyline: [],
      markers: []
    });
    this.stopNavigation();
  }
});
