'use strict';

const Homey = require('homey');
const dgram = require('dgram');
const axios = require('axios');

function isValidIPAddress(ipaddress) {
  // Check if ipaddress is undefined or null
  if (ipaddress === undefined || ipaddress === null) {
    return false; // Not a valid IP address
  }

  // Regular expression for IPv4 validation
  const ipPattern = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

  // Validate IP address pattern
  return ipPattern.test(ipaddress);
}

class iZoneApp extends Homey.App {

  async onInit() {
    this.log(`${this.id} running...`);

    // uncomment only for testing !!
    // this.homey.settings.unset('izone.ipaddress');
    this.enableRespDebug = true;

    this.updateSettings();

    if (!isValidIPAddress(this.ipaddress)) {
      this.homey.app.sendMessageAndReturnAddress()
        .then(address => {
          this.log('Remote address:', address);
          this.homey.settings.set('izone.ipaddress', address);
          this.ipaddress = address;
        })
        .catch(error => {
          this.error('Error occurred:', error);
        });
    }

    this.state = {};
    this.state.ac = {};
    this.state.ac.zones = {};

    // getFirmwareList
    let resultFmw = await this.getFirmwareList();
    if (resultFmw.status === "ok") {
      this.state.firmware = resultFmw.Fmw;

      this.isRunning = true;
      this.refreshPolling(2000); // start 2 second after init

      this.homey.settings.on('set', this.onSettingsChanged.bind(this));
    } 
  }

  refreshPolling(delay) {
    delay = delay || 0;
    this.homey.clearInterval(this.pollingID);
    this.homey.setTimeout(async () => {
      this.refresh();
      this.pollingID = this.homey.setInterval(async () => {
        if (this.isRunning) this.refresh();
      }, this.pollingInterval);
    }, delay);
  }

  async onSettingsChanged(key) {
    if (key === 'izone.polling' || key === 'izone.ipaddress') {
      this.updateSettings();
      this.homey.setTimeout(async () => {
        this.refreshPolling();
        await this.homey.api.realtime("settingsChanged", "otherSuccess");
      }, 1000);
    }
  }

  async updateSettings() {
    this.ipaddress = this.homey.settings.get('izone.ipaddress');

    const MIN_POLLING_INTERVAL = 15000;
    const MAX_POLLING_INTERVAL = 300000;

    let pollingInterval = parseInt(this.homey.settings.get('izone.polling'), 10);

    if (typeof pollingInterval !== 'number' || isNaN(pollingInterval)) {
      pollingInterval = MIN_POLLING_INTERVAL; // Default value if not a number or undefined
    } else {
      pollingInterval = Math.max(MIN_POLLING_INTERVAL, Math.min(MAX_POLLING_INTERVAL, pollingInterval));
    }

    this.pollingInterval = pollingInterval;
    this.log('Remote address:', this.ipaddress);
    this.log('Polling interval:', this.pollingInterval);
  }

  async onUninit() {
    this.isRunning = false;
  }

  async refresh() {
    // starting or repeating, so do getAcSystemInfo 
    let result = await this.getAcSystemInfo();
    if (result.status === "ok") {
      this.state.ac.sysinfo = result.SystemV2
      this.updateCapabilitiesDeviceId('ac.sysInfo');

      for (let zoneNum = 0; zoneNum < result.SystemV2.NoOfZones; zoneNum++) {
        const resultZone = await this.getZonesInfo(zoneNum);
        if (resultZone.status === "ok") {
          let zoneIdx = "zone" + resultZone.ZonesV2.Index;
          this.state.ac.zones[zoneIdx] = resultZone.ZonesV2;
          this.updateCapabilitiesDeviceId(zoneIdx);
        }
      }
    }
  }

  async updateCapabilitiesDeviceId(id) {
    // update the drivers and devices
    const drivers = this.homey.drivers.getDrivers();
    for (const driver in drivers) {
      const devices = this.homey.drivers.getDriver(driver).getDevices();
      for (const device of devices) {
        if (device.getData().id === id && device.updateCapabilities) {
          await device.setAvailable();
          await device.updateCapabilities();
          break;
        }
      }
    }
  }

  async getAcSystemInfo() {
    if (!isValidIPAddress(this.ipaddress)) return {};
    const uri = `http://${this.ipaddress}:80/iZoneRequestV2`;
    if (this.enableRespDebug) this.log(`getAcSystemInfo() ${uri}`);
    let respData = {};

    const mapBody = { "iZoneV2Request": { "Type": 1, "No": 0, "No1": 0 } };

    try {
      respData.status = "failed";
      const response = await axios.post(uri, JSON.stringify(mapBody), {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      respData = response.data;
      if (respData.hasOwnProperty("SystemV2")) respData.status = "ok";
    } catch (e) {
      if (this.enableRespDebug) this.log(`getAcSystemInfo() ERROR: ${e}`);
      respData.status = "failed: " + e;
    }
    return respData;
  }

  async getZonesInfo(zone) {
    if (!isValidIPAddress(this.ipaddress)) return {};
    const uri = `http://${this.ipaddress}:80/iZoneRequestV2`;
    if (this.enableRespDebug) this.log(`getZonesInfo() ${uri} ${zone}`);
    let respData = {};

    const mapBody = { "iZoneV2Request": { "Type": 2, "No": zone, "No1": 0 } };

    try {
      respData.status = "failed";
      const response = await axios.post(uri, JSON.stringify(mapBody), {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      respData = response.data;
      if (respData.hasOwnProperty("ZonesV2")) respData.status = "ok";
    } catch (e) {
      if (this.enableRespDebug) this.log(`getZonesInfo() ERROR: ${e}`);
      respData.status = "failed: " + e;
    }
    return respData;
  }

  async getFirmwareList() {
    if (!isValidIPAddress(this.ipaddress)) return {};
    const uri = `http://${this.ipaddress}:80/iZoneRequestV2`;
    if (this.enableRespDebug) this.log(`getFirmwareList() ${uri}`);
    let respData = {};

    const mapBody = { "iZoneV2Request": { "Type": 6, "No": 0, "No1": 0 } };

    try {
      respData.status = "failed";
      const response = await axios.post(uri, JSON.stringify(mapBody), {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      respData = response.data;
      if (respData.hasOwnProperty("Fmw")) respData.status = "ok";
    } catch (e) {
      if (this.enableRespDebug) this.log(`getFirmwareList() ERROR: ${e}`);
      respData.status = "failed: " + e;
    }
    return respData;
  }

  async sendSimpleiZoneCmd(cmd, value) {
    if (!isValidIPAddress(this.ipaddress)) return {};
    return this.sendSimpleUriCmdWithBody(
      `http://${this.ipaddress}:80/iZoneCommandV2`,
      JSON.stringify({ [cmd]: value }));
  }

  async sendSimpleUriCmdWithBody(uri, cmdbody) {

    if (this.enableRespDebug) this.log(`sendSimpleUriCmdWithBody() uri: ${uri} cmdbody: ${cmdbody}`);

    try {
      const response = await axios.post(uri, cmdbody, {
        responseType: 'text',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      return { status: response.data };
    } catch (e) {
      if (this.enableRespDebug) this.log(`sendSimpleUriCmdWithBody() ERROR: ${e}`);
      return { status: `failed: ${e}` };
    }
  }

  async sendMessageAndReturnAddress() {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');
      let remoteAddress;

      // Set up event listeners and binding only once
      socket.once('message', (message, remote) => {
        this.log(`CLIENT RECEIVED: ${remote.address} : ${remote.port} - ${message}`);
        remoteAddress = remote.address;
        resolve(remoteAddress);
      });

      socket.on('error', (err) => {
        reject(err);
      });

      socket.bind(() => {
        socket.setBroadcast(true);
        socket.send('IASD', 0, 4, 12107, '255.255.255.255', (err) => {
          if (err) {
            reject(err);
          }
        });
      });

      // Close the socket after 1 second if no response is received
      this.homey.setTimeout(() => {
        if (!remoteAddress) {
          socket.close();
          reject(new Error('No response received'));
        }
      }, 1000);
    });
  }
}

module.exports = iZoneApp;
