Page({
  data: {
    deviceInfo: null,
    contacts: [],
    autoSOS: true,
    lockScreen: false,
    sensitivity: 2,
    sensitivityText: '中等',
    showContactPopup: false,
    editingIndex: -1,
    form: { name: '', phone: '', isDefault: false }
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    const deviceInfo = wx.getStorageSync('deviceInfo') || null;
    const contacts = wx.getStorageSync('emergencyContacts') || [];
    const settings = wx.getStorageSync('settings') || {};
    
    this.setData({
      deviceInfo,
      contacts,
      autoSOS: settings.autoSOS !== false,
      lockScreen: settings.lockScreen || false,
      sensitivity: settings.sensitivity || 2,
      sensitivityText: ['低', '中等', '高'][settings.sensitivity || 2]
    });
  },

  // ========== 设备绑定 ==========
  scanDevice() {
    wx.showLoading({ title: '搜索中...' });
    
    wx.openBluetoothAdapter({
      success: () => {
        wx.startBluetoothDevicesDiscovery({
          success: (res) => {
            setTimeout(() => {
              wx.getBluetoothDevices({
                success: (res) => {
                  wx.hideLoading();
                  const devices = res.devices.filter(d => d.name);
                  if (devices.length === 0) {
                    wx.showToast({ title: '未发现设备', icon: 'none' });
                    return;
                  }
                  this.showDeviceList(devices);
                }
              });
            }, 3000);
          }
        });
      },
      fail: () => {
        wx.hideLoading();
        wx.showModal({
          title: '请开启蓝牙',
          content: '需要开启蓝牙才能搜索设备',
          success: (res) => {
            if (res.confirm) wx.openSetting();
          }
        });
      }
    });
  },

  showDeviceList(devices) {
    const items = devices.map(d => `${d.name} (${d.RSSI}dBm)`);
    wx.showActionSheet({
      itemList: items,
      success: (res) => {
        const selected = devices[res.tapIndex];
        this.bindDevice(selected);
      }
    });
  },

  bindDevice(device) {
    const deviceInfo = {
      name: device.name,
      deviceId: device.deviceId,
      rssi: device.RSSI,
      version: '1.0.2',
      connected: true,
      bindTime: new Date().toLocaleDateString()
    };
    
    wx.setStorageSync('deviceInfo', deviceInfo);
    this.setData({ deviceInfo });
    wx.showToast({ title: '绑定成功', icon: 'success' });
  },

  connectDevice() {
    const { deviceInfo } = this.data;
    if (!deviceInfo) return;
    
    if (deviceInfo.connected) {
      wx.closeBLEConnection({ deviceId: deviceInfo.deviceId });
      deviceInfo.connected = false;
    } else {
      wx.createBLEConnection({
        deviceId: deviceInfo.deviceId,
        success: () => { deviceInfo.connected = true; }
      });
    }
    
    wx.setStorageSync('deviceInfo', deviceInfo);
    this.setData({ deviceInfo });
  },

  unbindDevice() {
    wx.showModal({
      title: '解除绑定',
      content: '确定要解除设备绑定吗？',
      success: (res) => {
        if (res.confirm) {
          if (this.data.deviceInfo?.connected) {
            wx.closeBLEConnection({ deviceId: this.data.deviceInfo.deviceId });
          }
          wx.removeStorageSync('deviceInfo');
          this.setData({ deviceInfo: null });
          wx.showToast({ title: '已解除绑定' });
        }
      }
    });
  },

  // ========== 紧急联系人 ==========
  addContact() {
    this.setData({
      showContactPopup: true,
      editingIndex: -1,
      form: { name: '', phone: '', isDefault: false }
    });
  },

  editContact(e) {
    const index = e.currentTarget.dataset.index;
    const contact = this.data.contacts[index];
    this.setData({
      showContactPopup: true,
      editingIndex: index,
      form: { ...contact }
    });
  },

  closeContactPopup() {
    this.setData({ showContactPopup: false });
  },

  onNameChange(e) {
    this.setData({ 'form.name': e.detail });
  },

  onPhoneChange(e) {
    this.setData({ 'form.phone': e.detail });
  },

  onDefaultChange(e) {
    this.setData({ 'form.isDefault': e.detail.value });
  },

  saveContact() {
    const { form, editingIndex, contacts } = this.data;
    
    if (!form.name.trim()) {
      wx.showToast({ title: '请输入姓名', icon: 'none' });
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(form.phone)) {
      wx.showToast({ title: '手机号格式错误', icon: 'none' });
      return;
    }

    let newContacts = [...contacts];
    
    // 如果设为默认，取消其他默认
    if (form.isDefault) {
      newContacts = newContacts.map(c => ({ ...c, isDefault: false }));
    }
    
    if (editingIndex >= 0) {
      newContacts[editingIndex] = form;
    } else {
      // 第一个联系人自动设为默认
      if (newContacts.length === 0) form.isDefault = true;
      newContacts.push(form);
    }

    wx.setStorageSync('emergencyContacts', newContacts);
    this.setData({ contacts: newContacts, showContactPopup: false });
    wx.showToast({ title: '保存成功', icon: 'success' });
  },

  // ========== 安全设置 ==========
  toggleAutoSOS(e) {
    this.saveSetting('autoSOS', e.detail.value);
  },

  toggleLockScreen(e) {
    this.saveSetting('lockScreen', e.detail.value);
  },

  setSensitivity() {
    const items = ['低（需较大震动）', '中等', '高（轻微震动触发）'];
    wx.showActionSheet({
      itemList: items,
      success: (res) => {
        this.saveSetting('sensitivity', res.tapIndex);
        this.setData({
          sensitivity: res.tapIndex,
          sensitivityText: ['低', '中等', '高'][res.tapIndex]
        });
      }
    });
  },

  saveSetting(key, value) {
    const settings = wx.getStorageSync('settings') || {};
    settings[key] = value;
    wx.setStorageSync('settings', settings);
  },

  // ========== 通用 ==========
  goHelp() {
    wx.navigateTo({ url: '/pages/help/help' });
  },

  goAbout() {
    wx.navigateTo({ url: '/pages/about/about' });
  },

  clearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '确定要清除所有本地数据吗？',
      success: (res) => {
        if (res.confirm) {
          wx.clearStorageSync();
          this.setData({
            deviceInfo: null,
            contacts: []
          });
          wx.showToast({ title: '已清除', icon: 'success' });
        }
      }
    });
  }
});