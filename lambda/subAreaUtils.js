function getValidSubareaObj(body, parkName) {
  let obj = { parkName: parkName };
  if (body.orcs) {
    obj["orcs"] = body.orcs;
  }
  if (body.activities) {
    let activityArray = [];
    for (let i = 0; i < body.activities.length; i++) {
      const activity = body.activities[i];
      if (validActivities.includes(activity)) {
        activityArray.push(activity);
      }
    }
    obj["activities"] = activityArray;
  }
  if (body.managementArea) {
    obj["managementArea"] = body.managementArea;
  }
  if (body.section) {
    obj["section"] = body.section;
  }
  if (body.region) {
    obj["region"] = body.region;
  }
  if (body.bundle) {
    obj["bundle"] = body.bundle;
  }
  if (body.subAreaName) {
    obj["subAreaName"] = body.subAreaName;
  }
  obj["isLegacy"] = body.isLegacy ? body.isLegacy : false;
  return obj;
}

const validActivities = [
  "Frontcountry Camping",
  "Frontcountry Cabins",
  "Group Camping",
  "Backcountry Camping",
  "Backcountry Cabins",
  "Boating",
  "Day Use",
];

module.exports = {
  getValidSubareaObj,
  validActivities,
};
