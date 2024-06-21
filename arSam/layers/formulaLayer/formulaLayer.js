const { marshall } = require('@aws-sdk/util-dynamodb');
const { TABLE_NAME } = require("/opt/baseLayer");
const { validActivities } = require("/opt/subAreaLayer");

const gstPercent = 5;
const defaultDecimalPlaces = 1;

function isValidNumber(n) {
  if (!n) {
    if (n === 0) {
      return true;
    }
    return false;
  }
  return true;
}

function arraySum(arr) {
  let sum = 0;
  let nullArray = true;
  for (let num of arr) {
    if (isValidNumber(num) && typeof num === "number") {
      sum += num;
      nullArray = false;
    }
  }
  if (nullArray) {
    return undefined;
  }
  return sum;
}

function inversePercentage(value, percentage) {
  const result = (value * 100) / (100 + percentage);
  return result;
}

function formatMoney(amt) {
  if (isValidNumber(amt)) {
    return formatDecimal(amt, 2);
  }
  return "";
}

function formatDecimal(value, dPlaces) {
  if (!dPlaces) {
    dPlaces = defaultDecimalPlaces;
  }
  if (isValidNumber(value)) {
    value = Number(value.toFixed(dPlaces));
    return value;
  }
  return "";
}

function basicNetRevenue(revenues, customPercent) {
  let result = null;
  let percent = customPercent ? customPercent : gstPercent;
  const gross = arraySum(revenues);
  const net = inversePercentage(gross, percent);
  if (isValidNumber(gross)) {
    result = formatMoney(net);
  }
  let res = {
    result: result,
    formula: `Net revenue = Gross revenue - ${percent}% GST`,
  };
  return res;
}

function totalWithModifier(arr, mod) {
  let result = arraySum(arr);
  if (result === undefined) {
    result = null;
  }
  if (mod || mod === 0) {
    result *= mod;
  }
  return result;
}

function formatTotalWithModifier(arr, mod) {
  let result = undefined;
  let total = totalWithModifier(arr, mod);
  if (isValidNumber(total)) {
    result = formatDecimal(total);
  }
  return result;
}

function frontcountryCampingPartyAttendance(attendances, modifier) {
  let formula = `Total attendance = (Standard + Senior + SSFE + Long stay)`;
  if (modifier) {
    formula += ` x ${modifier}`;
  }
  return {
    result: formatTotalWithModifier(attendances, modifier),
    formula: formula,
  };
}

function frontcountryCampingSecondCarAttendance(attendances) {
  return {
    result: formatTotalWithModifier(attendances),
    formula: `Total attendance = (Standard + Senior + SSFE)`,
  };
}

function frontcountryCabinsPartiesAttendance(attendances, modifier) {
  let formula = `Total attendance = Parties`;
  if (modifier) {
    formula += ` x ${modifier}`;
  }
  return {
    result: formatTotalWithModifier(attendances, modifier),
    formula: formula,
  };
}

function groupCampingStandardAttendance(attendances) {
  return {
    result: formatTotalWithModifier(attendances),
    formula: `Total people = (Adult + Youth + Children)`,
  };
}

function dayUseVehicleAttendance(
  trailCount,
  vehicles,
  buses,
  vehicleMod,
  busMod
) {
  let trailCountTotal = totalWithModifier(trailCount);
  let vehicleTotal = totalWithModifier(vehicles, vehicleMod);
  let busTotal = totalWithModifier(buses, busMod);
  let vehicleFormula = "Vehicles";
  let busFormula = "Bus count";
  if (vehicleMod) {
    vehicleFormula = `(Vehicles x ${vehicleMod})`;
  }
  if (busMod) {
    busFormula = `(Bus count x ${busMod})`;
  }
  return {
    result: formatTotalWithModifier([vehicleTotal, busTotal, trailCountTotal]),
    formula: `Vehicle attendance = ${vehicleFormula} + ${busFormula} + Trail count`,
  };
}

function backcountryCabinsAttendance(individuals, families, familyMod) {
  let individualTotal = totalWithModifier(individuals);
  let familyTotal = totalWithModifier(families, familyMod);
  let familyFormula = "Family";
  if (familyMod) {
    familyFormula = `(Family x ${familyMod})`;
  }
  return {
    result: formatTotalWithModifier([individualTotal, familyTotal]),
    formula: `Total people = Adults + Children + ${familyFormula}`,
  };
}

function boatingAttendance(attendances, modifier) {
  let formula = `Boat attendance = (On dock + On buoys + Miscellaneous boats)`;
  if (modifier) {
    formula += ` x ${modifier}`;
  }
  return {
    result: formatTotalWithModifier(attendances, modifier),
    formula: formula,
  };
}

function createPutFormulaConfigObj(
  activities,
  subAreaId,
  parkName,
  orcs,
  subAreaName
) {
  // For each activity, add the config for that subAreaId::activity
  let formulaConfigObjArray = [];
  for (const activity of activities) {
    let formulaConfigObj;
    if (!validActivities.includes(activity)) {
      break;
    }
    formulaConfigObj = {
      pk: { S: "config::" + subAreaId },
      sk: marshall(activity),
      parkName: marshall(parkName),
      orcs: marshall(orcs),
      subAreaId: marshall(subAreaId),
      subAreaName: marshall(subAreaName),
    };
    // Default formula configs
    switch (activity) {
      case "Frontcountry Camping":
        formulaConfigObj["attendanceModifier"] =
          marshall(3.2);
        break;
      case "Day Use":
        formulaConfigObj["attendanceVehiclesModifier"] =
          marshall(3.5);
        formulaConfigObj["attendanceBusModifier"] =
          marshall(40);
        break;
      case "Backcountry Cabins":
        formulaConfigObj["attendanceModifier"] =
          marshall(3.2);
        break;
      case "Boating":
        formulaConfigObj["attendanceModifier"] =
          marshall(3.2);
        break;
      case "Frontcountry Cabins":
        formulaConfigObj["attendanceModifier"] =
          marshall(3.2);
        break;
    }
    formulaConfigObjArray.push({
      TableName: TABLE_NAME,
      ConditionExpression: "attribute_not_exists(sk)",
      Item: formulaConfigObj,
    });
  }
  return formulaConfigObjArray;
}

module.exports = {
  arraySum,
  basicNetRevenue,
  dayUseVehicleAttendance,
  frontcountryCampingPartyAttendance,
  frontcountryCampingSecondCarAttendance,
  frontcountryCabinsPartiesAttendance,
  groupCampingStandardAttendance,
  backcountryCabinsAttendance,
  boatingAttendance,
  createPutFormulaConfigObj,
};
