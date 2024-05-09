'use strict';

const { Driver } = require('homey');
const iZoneTypes = require('../../izonetypes');

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
   * { 
   * "Index":6,
   * "Name":"Media",
   * "ZoneType":3,
   * "SensType":3,
   * "Mode":3,
   * "Setpoint":2350,
   * "Temp":2401,
   * "MaxAir":100,
   * "MinAir":0,
   * "Const":255,
   * "ConstA":0,
   * "Master":0,
   * "DmpFlt":0,
   * "iSense":0,
   * "Area":16,
   * "Calibration":0,
   * "Bypass":0,
   * "DmpPos":50,
   * "RfSignal":0,
   * "BattVolt":0,
   * "SensorFault":0,
   * "BalanceMax":75,
   * "BalanceMin":0,
   * "DamperSkip":0
   * }
   */
  async onPairListDevices() {
    await this.homey.app.refresh();
    var devices = [];
    for (const keyid in this.homey.app.state.ac.zones) {
      const zone = this.homey.app.state.ac.zones[keyid];
      // don't include ZoneType_Constant
      if (zone.ZoneType != iZoneTypes.ZoneType_Constant) {
        const device = { name: zone.Name,  data: { id: keyid }, store: { index: zone.Index } }; //, zonedata: zone } };
        this.log(`device ${JSON.stringify(device)}`);
        devices.push(device);
      }
    }

    return devices;
  }

}

module.exports = iZoneACDriver;
