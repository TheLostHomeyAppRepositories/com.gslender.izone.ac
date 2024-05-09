'use strict';

const { Driver } = require('homey');

class iZoneACDriver extends Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('iZoneACDriver has been initialized');
  }

  /**
   * onPairListDevices is called when a user is adding a device
   * and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
    await this.homey.app.refresh();
    var devices = [];
    const acSysInfo = this.homey.app.state.ac.sysinfo;
    const device = { data: { id: acSysInfo } }; //, zonedata: zone } };
    devices.push(device);

    return devices;
  }

}

module.exports = iZoneACDriver;
