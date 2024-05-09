// iZoneTypes.js

//ZoneType_e
const ZoneType_OpenClose = 1;
const ZoneType_Constant = 2;
const ZoneType_Auto = 3;

//ZoneMode_e
const ZoneMode_Na = 0;
const ZoneMode_Open = 1;
const ZoneMode_Close = 2;
const ZoneMode_Auto = 3;
const ZoneMode_Override = 4;
const ZoneMode_Constant = 5;
const ZoneModeIdMap = {
  0: 'na',
  1: 'open',
  2: 'close',
  3: 'auto',
  4: 'override',
  5: 'constant',
};
function GetZoneModeValue(str) {
  for (const key in ZoneModeIdMap) {
      if (ZoneModeIdMap[key] === str) {
          return parseInt(key, 10);
      }
  }
  return ZoneMode_Na;
}

//SysOn_e
const SysOn_Off = 0;
const SysOn_On = 1;

//SysMode_e
const SysMode_Na = 0;
const SysMode_Cool = 1;
const SysMode_Heat = 2;
const SysMode_Vent = 3;
const SysMode_Dry = 4;
const SysMode_Auto = 5;
const SysMode_Exhaust = 6;
const SysMode_PumpOnly = 7;
const SysModeIdMap = {
  0: 'na',
  1: 'cool',
  2: 'heat',
  3: 'vent',
  4: 'dry',
  5: 'auto',
  5: 'exhaust',
  5: 'pumponly',
};
function GetSysModeValue(str) {
  for (const key in SysModeIdMap) {
      if (SysModeIdMap[key] === str) {
          return parseInt(key, 10);
      }
  }
  return SysMode_Na;
}


//SysFan_e
const SysFan_Na = 0;
const SysFan_Low = 1;
const SysFan_Med = 2;
const SysFan_High = 3;
const SysFan_Auto = 4;
const SysFan_Top = 5;
const SysFan_NonGasHeat = 99;
const SysFanIdMap = {
  0: 'na',
  1: 'low',
  2: 'medium',
  3: 'high',
  4: 'auto',
  5: 'top',
  99: 'non_gas_heat'
};
function GetSysFanValue(str) {
  for (const key in SysFanIdMap) {
      if (SysFanIdMap[key] === str) {
          return parseInt(key, 10);
      }
  }
  return SysFan_Na;
}

module.exports = {
  ZoneType_OpenClose,
  ZoneType_Constant,
  ZoneType_Auto,
  ZoneMode_Na,
  ZoneMode_Open,
  ZoneMode_Close,
  ZoneMode_Auto,
  ZoneMode_Override,
  ZoneMode_Constant,
  ZoneModeIdMap,
  GetZoneModeValue,
  SysOn_Off,
  SysOn_On,
  SysMode_Na,
  SysMode_Cool,
  SysMode_Heat,
  SysMode_Vent,
  SysMode_Dry,
  SysMode_Auto,
  SysMode_Exhaust,
  SysMode_PumpOnly,
  SysModeIdMap,
  GetSysModeValue,
  SysFan_Na,
  SysFan_Low,
  SysFan_Med,
  SysFan_High,
  SysFan_Auto,
  SysFan_Top,
  SysFan_NonGasHeat,
  SysFanIdMap,
  GetSysFanValue
};
