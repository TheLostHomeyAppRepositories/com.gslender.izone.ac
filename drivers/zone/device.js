'use strict';

const { Device } = require('homey');
const iZoneTypes = require('../../izonetypes');

class ZoneDevice extends Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('ZoneDevice has been initialized');

    this.registerCapabilityListener("onoff", async (value) => {
      const zone = this.getThisZone();
      if (zone == undefined) return;

      if (value) {
        this.homey.app.sendSimpleiZoneCmd("ZoneMode", { Index: zone.Index, Mode: iZoneTypes.ZoneMode_Auto });
      } else {
        this.homey.app.sendSimpleiZoneCmd("ZoneMode", { Index: zone.Index, Mode: iZoneTypes.ZoneMode_Close });
      }
      this.homey.app.state = {};
      setTimeout(() => { this.homey.app.refresh(); }, 500);
    });

    this.registerCapabilityListener("target_temperature", async (value) => {
      const zone = this.getThisZone();
      if (zone == undefined) return;
      this.homey.app.sendSimpleiZoneCmd("ZoneSetpoint", { Index: zone.Index, Setpoint: value * 100 });
      this.homey.app.state = {};
      setTimeout(() => { this.homey.app.refresh(); }, 500);
    });


    this.registerCapabilityListener("zone_mode", async (value) => {
      const zone = this.getThisZone();
      if (zone == undefined) return;
      this.homey.app.sendSimpleiZoneCmd("ZoneMode", { Index: zone.Index, Mode: iZoneTypes.GetZoneModeValue(value) });
      this.homey.app.state = {};
      setTimeout(() => { this.homey.app.refresh(); }, 500);
    });
  }

  getThisZone() {
    if (this.homey.app.state?.ac?.zones) return this.homey.app.state.ac.zones[this.getData().id]
    return undefined;
  }

  async updateCapabilities() {
    const zone = this.getThisZone();
    if (zone == undefined) return;
    this.setCapabilityValue('onoff', zone.Mode === iZoneTypes.ZoneMode_Auto || zone.Mode === iZoneTypes.ZoneMode_Open);
    this.setCapabilityValue('measure_temperature', zone.Temp / 100);
    this.setCapabilityValue('target_temperature', zone.Setpoint / 100);
    this.setCapabilityValue('zone_mode', iZoneTypes.ZoneModeIdMap[zone.Mode]);
  }
}
module.exports = ZoneDevice;