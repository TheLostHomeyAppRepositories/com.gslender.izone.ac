'use strict';

const Homey = require('homey');
const dgram = require('dgram');
const net = require('net');

function isValidIPAddress(ipaddress) {
  if (!ipaddress) return false; // Check for undefined or null
  const ipPattern = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return ipPattern.test(ipaddress);
}

class iZoneApp extends Homey.App {
  async onInit() {
    this.log(`${this.id} running...`);
    this.enableRespDebug = true;
    this.updateSettings();

    if (!isValidIPAddress(this.ipaddress)) {
      try {
        const address = await this.sendMessageAndReturnAddress();
        this.log('Remote address:', address);
        this.homey.settings.set('izone.ipaddress', address);
        this.ipaddress = address;
      } catch (error) {
        this.error('Error occurred:', error);
      }
    }

    this.state = { ac: { zones: {} } };

    const resultFmw = await this.getFirmwareList();
    this.log('Firmware List:', resultFmw);

    if (resultFmw.status === "ok") {
      this.state.firmware = resultFmw.Fmw;
      this.isRunning = true;
      await this.refreshPolling(2000);

      this.homey.settings.on('set', this.onSettingsChanged.bind(this));
    }
  }

  async refreshPolling(delay = 0) {
    this.homey.clearInterval(this.pollingID);
    this.homey.setTimeout(async () => {
      await this.refresh();
      this.pollingID = this.homey.setInterval(async () => {
        if (this.isRunning) await this.refresh();
      }, this.pollingInterval);
    }, delay);
  }

  async onSettingsChanged(key) {
    if (['izone.polling', 'izone.ipaddress'].includes(key)) {
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
    const pollingInterval = Math.max(
      MIN_POLLING_INTERVAL,
      Math.min(
        MAX_POLLING_INTERVAL,
        parseInt(this.homey.settings.get('izone.polling'), 10) || MIN_POLLING_INTERVAL
      )
    );
    this.pollingInterval = pollingInterval;

    this.log('Remote address:', this.ipaddress);
    this.log('Polling interval:', this.pollingInterval);
  }

  async refresh() {
    let failed = false;
    const result = await this.getAcSystemInfo();
    if (result.status === "ok") {
      this.state.ac.sysinfo = result.SystemV2;
      this.updateCapabilitiesDeviceId('ac.sysInfo');

      for (let zoneNum = 0; zoneNum < result.SystemV2.NoOfZones; zoneNum++) {
        const resultZone = await this.getZonesInfo(zoneNum);
        if (resultZone.status === "ok") {
          const zoneIdx = `zone${resultZone.ZonesV2.Index}`;
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
    const drivers = this.homey.drivers.getDrivers();
    for (const driver in drivers) {
      const devices = this.homey.drivers.getDriver(driver).getDevices();
      for (const device of devices) {
        if (device.getData().id === id && device.updateCapabilities) {
          await device.setAvailable();
          await device.updateCapabilities();
        }
      }
    }
  }

  async setDevicesUnavailable() {
    const drivers = this.homey.drivers.getDrivers();
    for (const driver in drivers) {
      const devices = this.homey.drivers.getDriver(driver).getDevices();
      for (const device of devices) {
        await device.setAvailable();
      }
    }
  }

  async sendRawRequest(path, body) {
    if (!isValidIPAddress(this.ipaddress)) return { status: 'failed: invalid IP address' };
    const host = this.ipaddress;
    const port = 80;

    const request = `POST ${path} HTTP/1.1\r\n\r\n` +
      body;

    return new Promise((resolve, reject) => {
      const client = net.createConnection({ host, port }, () => {
        if (this.enableRespDebug) this.log(`Sending request:\n${request}`);
        client.write(request);
      });

      let responseData = '';
      client.on('data', (chunk) => {
        responseData += chunk.toString();
      });

      client.on('end', () => {
        try {
          const [headers, body = ''] = responseData.split('\r\n\r\n');
          const statusCode = parseInt(headers.split(' ')[1], 10);
          if (statusCode === 200) {
            if (body.trim()) {
              try {
                // Try to parse the body as JSON
                resolve({ ...JSON.parse(body), status: 'ok' });
              } catch (jsonErr) {
                resolve({ status: 'ok', body: body.trim() });
              }
            } else {
              // No body in the response
              resolve({ status: 'ok' });
            }
          } else {
            resolve({ status: `failed: HTTP ${statusCode}` });
          }
        } catch (err) {
          this.log(err.stack); // Dump the stack trace to log
          reject(`Failed to parse response: ${err}`);
        }
      });

      client.on('error', (err) => {
        resolve({ status: `failed: ${err.message}` });
      });
    });
  }

  async getAcSystemInfo() {
    const body = JSON.stringify({ iZoneV2Request: { Type: 1, No: 0, No1: 0 } });
    return this.sendRawRequest('/iZoneRequestV2', body);
  }

  async getZonesInfo(zone) {
    const body = JSON.stringify({ iZoneV2Request: { Type: 2, No: zone, No1: 0 } });
    return this.sendRawRequest('/iZoneRequestV2', body);
  }

  async getFirmwareList() {
    const body = JSON.stringify({ iZoneV2Request: { Type: 6, No: 0, No1: 0 } });
    return this.sendRawRequest('/iZoneRequestV2', body);
  }

  async sendSimpleiZoneCmd(cmd, value) {
    const body = JSON.stringify({ [cmd]: value });
    return this.sendRawRequest('/iZoneCommandV2', body);
  }

  async sendMessageAndReturnAddress() {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');
      socket.once('message', (message, remote) => {
        resolve(remote.address);
      });
      socket.on('error', reject);
      socket.bind(() => {
        socket.setBroadcast(true);
        socket.send('IASD', 0, 4, 12107, '255.255.255.255', (err) => {
          if (err) reject(err);
        });
      });
      this.homey.setTimeout(() => {
        socket.close();
        reject(new Error('No response received'));
      }, 1000);
    });
  }
}

module.exports = iZoneApp;