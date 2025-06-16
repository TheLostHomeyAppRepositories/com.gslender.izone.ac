'use strict';

const Homey = require('homey');
const dgram = require('dgram');
const http = require('http');

const agent = new http.Agent({ keepAlive: true, maxSockets: 1, timeout: 5000  });

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
    this.log('result = ', resultFmw);
    if (resultFmw.status === "ok") {
      this.state.firmware = resultFmw.Fmw;

      this.isRunning = true;
      await this.refreshPolling(2000); // start 2 second after init

      this.homey.settings.on('set', this.onSettingsChanged.bind(this));
      
      // Check every 60,000 milliseconds (i.e., 1 minute)
      setInterval(() => {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        
        // If it's exactly 2:00 AM...
        if (hours === 2 && minutes === 0) {
          this.log(`>>>>>>RESET BRIDGE `);
          this.resetBridge();
        }
      }, 60_000);
    }
  }

  async refreshPolling(delay) {
    delay = delay || 0;
    this.homey.clearInterval(this.pollingID);
    this.homey.setTimeout(async () => {
      await this.refresh();
      this.pollingID = this.homey.setInterval(async () => {
        if (this.isRunning) await this.refresh();
      }, this.pollingInterval);
    }, delay);
  }

  async onSettingsChanged(key) {
    if (key === 'izone.polling' || key === 'izone.ipaddress') {
      this.updateSettings();
      this.homey.setTimeout(async () => {
        await this.refreshPolling();
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
    let failed = false;
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
        } else {
          failed = true;
        }
      }
    } else {
      failed = true;
    }
    if (failed) await this.setDevicesUnavailable();
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

  async setDevicesUnavailable() {
    // update the drivers and devices
    const drivers = this.homey.drivers.getDrivers();
    for (const driver in drivers) {
      const devices = this.homey.drivers.getDriver(driver).getDevices();
      for (const device of devices) {
        await device.setAvailable();
      }
    }
  }

  async getAcSystemInfo() {
    const host = this.ipaddress;
    const path = '/iZoneRequestV2';
    const port = 80;
    let respData = {};
    const mapBody = JSON.stringify({ "iZoneV2Request": { "Type": 1, "No": 0, "No1": 0 } });

    try {
      respData.status = "failed";

      const options = {
        hostname: host,
        port: port,
        path: path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(mapBody),
        },
        agent: agent, // Use the HTTP agent with keep-alive
      };

      if (this.enableRespDebug) this.log(`getAcSystemInfo() POST ${host}${path}`);

      respData = await new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                const jsonData = JSON.parse(data);
                resolve({ ...jsonData, status: jsonData.SystemV2 ? 'ok' : 'failed' });
              } catch (err) {
                reject(`Failed to parse response: ${err}`);
              }
            } else {
              if (this.enableRespDebug) {
                this.log(`getAcSystemInfo() ERROR: HTTP ${res.statusCode}`);
              }
              resolve({ status: `failed: HTTP ${res.statusCode}` });
            }
          });
        });

        req.on('error', (err) => {
          if (this.enableRespDebug) this.log(`getAcSystemInfo() ERROR: ${err.message}`);
          resolve({ status: `failed: ${err.message}` });
        });

        req.write(mapBody);
        req.end(); // Close the connection immediately after sending the request
      });
    } catch (e) {
      if (this.enableRespDebug) this.log(`getAcSystemInfo() ERROR: ${e}`);
      respData.status = "failed: " + e;
    }

    return respData;
  }

  async getZonesInfo(zone) {
    if (!isValidIPAddress(this.ipaddress)) return {};
    const host = this.ipaddress;
    const path = '/iZoneRequestV2';
    const port = 80;
    let respData = {};
    const mapBody = JSON.stringify({ "iZoneV2Request": { "Type": 2, "No": zone, "No1": 0 } });

    try {
      respData.status = "failed";

      const options = {
        hostname: host,
        port: port,
        path: path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(mapBody),
        },
        agent: agent, // Use the HTTP agent with keep-alive
      };

      if (this.enableRespDebug) this.log(`getZonesInfo() POST ${host}${path} Zone: ${zone}`);

      respData = await new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                const jsonData = JSON.parse(data);
                resolve({ ...jsonData, status: jsonData.ZonesV2 ? 'ok' : 'failed' });
              } catch (err) {
                reject(`Failed to parse response: ${err}`);
              }
            } else {
              if (this.enableRespDebug) {
                this.log(`getZonesInfo() ERROR: HTTP ${res.statusCode}`);
              }
              resolve({ status: `failed: HTTP ${res.statusCode}` });
            }
          });
        });

        req.on('error', (err) => {
          if (this.enableRespDebug) this.log(`getZonesInfo() ERROR: ${err.message}`);
          resolve({ status: `failed: ${err.message}` });
        });

        req.write(mapBody);
        req.end(); // Ensure the connection is closed immediately after sending the request
      });
    } catch (e) {
      if (this.enableRespDebug) this.log(`getZonesInfo() ERROR: ${e}`);
      respData.status = "failed: " + e;
    }

    return respData;
  }

  async getFirmwareList() {
    if (!isValidIPAddress(this.ipaddress)) return {};
    const host = this.ipaddress;
    const path = '/iZoneRequestV2';
    const port = 80;
    let respData = {};
    const mapBody = JSON.stringify({ "iZoneV2Request": { "Type": 6, "No": 0, "No1": 0 } });

    try {
      respData.status = "failed";

      const options = {
        hostname: host,
        port: port,
        path: path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(mapBody),
        },
        agent: agent, // Use the HTTP agent with keep-alive
      };

      if (this.enableRespDebug) this.log(`getFirmwareList() POST ${host}${path}`);

      respData = await new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                const jsonData = JSON.parse(data);
                resolve({ ...jsonData, status: jsonData.Fmw ? 'ok' : 'failed' });
              } catch (err) {
                reject(`Failed to parse response: ${err}`);
              }
            } else {
              if (this.enableRespDebug) {
                this.log(`getFirmwareList() ERROR: HTTP ${res.statusCode}`);
              }
              resolve({ status: `failed: HTTP ${res.statusCode}` });
            }
          });
        });

        req.on('error', (err) => {
          if (this.enableRespDebug) this.log(`getFirmwareList() ERROR: ${err.message}`);
          resolve({ status: `failed: ${err.message}` });
        });

        req.write(mapBody);
        req.end(); // Ensure the connection is closed immediately after sending the request
      });
    } catch (e) {
      if (this.enableRespDebug) this.log(`getFirmwareList() ERROR: ${e}`);
      respData.status = "failed: " + e;
    }

    return respData;
  }

  async resetBridge() {
    const body = JSON.stringify({ "ReSetMe": 12345 });
    return this.sendRawRequest('/iZoneCommandV2', body);
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
      const { hostname, port, path } = new URL(uri);
      const options = {
        hostname,
        port: port || 80, // Default to port 80 if not explicitly provided
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(cmdbody),
        },
        agent: agent, // Use the HTTP agent with keep-alive
      };

      const result = await new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            if (res.statusCode === 200) {
              resolve({ status: data }); // Response type is 'text'
            } else {
              if (this.enableRespDebug) {
                this.log(`sendSimpleUriCmdWithBody() ERROR: HTTP ${res.statusCode}`);
              }
              resolve({ status: `failed: HTTP ${res.statusCode}` });
            }
          });
        });

        req.on('error', (err) => {
          if (this.enableRespDebug) this.log(`sendSimpleUriCmdWithBody() ERROR: ${err.message}`);
          resolve({ status: `failed: ${err.message}` });
        });

        req.write(cmdbody);
        req.end(); // Ensure the connection is closed immediately
      });

      return result;
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
