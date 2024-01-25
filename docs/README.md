# A&R Data Structure

This document is intended to describe how the data model for various items in the database are structured. It should help you construct a `pk/sk` query for your needs.

## Parks
```js
{
  pk: park,
  sk: <orcs>, // the string orcs id of the park
  isLegacy: false, // boolean - whether or not the park is legacy
  orcs: <orcs>,
  parkName: <parkName>, // string name of the park
  roles: [
    sysadmin,
    <orcs>
  ], // string list of roles for the park
  subAreas: [
    {
      name: <subAreaName>,
      id: <subAreaId>
    }
  ], // map list of subareas within the park
}
```

## Subareas

Subareas belong to parks and are areas of activity grouped together, typically by feature or proximity.

You can get a list of subareas and their ids for a particular park using the [parks](#parks) structure above.

```js
{
  pk: park::<orcs>, // includes the orcs of the park the subarea belongs to
  sk: <subAreaID>,
  isLegacy: false, // boolean - whether or not the subarea is legacy
  orcs: <orcs>,
  parkName: <parkName>,
  roles: [
    sysadmin,
    <orcs>:<subAreaId> // orcs and subarea id separated by a single colon
  ],
  activities: [
    Backcountry Cabins,
    Backcountry Camping,
    Boating,
    Day Use,
    Group Camping,
    Frontcountry Cabins,
    Frontcountry Camping
  ], // string set containing at least one of the above activity types
  bundle: <bundle>, // string bundle
  managementArea: <managementArea>, // string management area
  region: <region>, // string region
  section: <section>, // string section
  subAreaName: <subAreaName> // string name of the subarea
}
```

## Configs

Each subarea will have 1 config object per `activity`. Configs are used to establish modifiers for all activities within the subarea independent of time.

You can get a list of all the configs within a subarea by looking at `activities` in the [subareas](#subareas) structure above.

```js
{
  pk: config::<subAreaId>, // includes the subarea id of the subarea
  sk: <activity>, // string activity
  orcs: <orcs>,
  parkName: <parkName>,
  subAreaName: <subAreaName>,
  subAreaId: <subAreaId>,
  attendanceModifier: 1, // number
  attendanceVehiclesModifier: 1, // number
  attendanceBusModifier: 1, // number
}
```

## Activity Records

Each subarea can have at most 1 activity record per month per config object. An activity record documents the attendance and revenue for a particular activity in a particular subarea for a particular month.

Each activity type will have its own different `[activitySpecificFields]`.

### Root Activity Record
```js
{
  pk: <subAreaID>::<activity>, // includes the subarea id and activity
  sk: <date>, // see the date property
  orcs: <orcs>,
  parkName: <parkName>,
  subAreaName: <subAreaName>,
  subAreaId: <subAreaID>,
  activity: <activity>, // string of the particular activity
  config: <configObj>, // a copy of the config object used to create the activity record
  date: <date>, // string year and month in YYYYMM format
  lastUpdated: <ISODate>, // ISO date & time the record was last updated
  notes: <notes>, // string notes
  isLocked: false, // boolean - whether or not the record is locked against editing
  [activitySpecificFields]
}
```

### Backcountry Cabins Activity Record - Specific Fields
```js
{
  peopleAdult: <number>,
  peopleChild: <number>,
  peopleFamily: <number>,
  revenueFamily: <number>
}
```

### Backcountry Camping Activity Record - Specific Fields
```js
{
  people: <number>.
  grossCampingRevenue: <number>
}
```

### Boating Activity Record - Specific Fields
```js
{
  boatAttendanceMiscellaneous: <number>,
  boatAttendanceNightsOnBouys: <number>,
  boatAttendanceNightsOnDock: <number>,
  boatRevenueGross: <number>,
}
```

### Day Use Activity Record - Specific Fields
```js
{
  otherDayUsePeopleHotSprings: <number>,
  otherDayUseRevenueHotSprings: <number>,
  peopleAndVehiclesBus: <number>,
  peopleAndVehiclesTrail: <number>,
  peopleAndVehiclesVehicle: <number>,
  picnicRevenueGross: <number>,
  picnicRevenueShelter: <number>,
  picnicShelterPeople: <number>
}
```

### Group Camping Activity Record - Specific Fields
```js
{
  standardRateGroupsRevenueGross: <number>,
  standardRateGroupsTotalPeopleAdults: <number>,
  standardRateGroupsTotalPeopleKids: <number>,
  standardRateGroupsTotalPeopleStandard: <number>,
  standardRateGroupsTotalPeopleYouth: <number>,
  youthRateGroupsAttendanceGroupNights: <number>,
  youthRateGroupsAttendancePeople: <number>,
  youthRateGroupsRevenueGross: <number>
}
```

### Frontcountry Cabins Activity Record - Specific Fields
```js
{
  revenueGrossCamping: <number>,
  totalAttendanceParties: <number>
}
```

### Frontcountry Camping Activity Record - Specific Fields
```js
{
  campingPartyNightsAttendanceLongStay: <number>,
  campingPartyNightsAttendanceSenior: <number>,
  campingPartyNightsAttendanceSocial: <number>,
  campingPartyNightsAttendanceStandard: <number>,
  campingPartyNightsRevenueGross: <number>,
  otherRevenueElectrical: <number>,
  otherRevenueGrossSani: <number>,
  otherRevenueShower: <number>,
  secondCarsAttendanceSenior: <number>,
  secondCarsAttendanceSocial: <number>,
  secondCarsAttendanceStandard: <number>,
  secondCarsRevenueGross: <number>
}
```

## Fiscal Year Locks
Fiscal year locks lock all records within a fiscal year (Apr-March) when enabled. The year used is the year in which the fiscal year ends.  March 2021 - April 2022 will have a fiscal year of 2022.

There will be at most 1 fiscal year lock per year.

```js
{
  pk: fiscalYearEnd,
  sk: <year>, // year in YYYY format
  isLocked: false // boolean - whether or not the fiscal year is locked
}
```

## Variance records
Variances track differences in activity field record values from year to year. There will be at most 1 variance record per activity record in the database.

```js
{
  pk: variance::<orcs>::<date> ,// includes orcs and YYYYMM date
  sk: <subAreaId>::<activity>, // includes subarea id and activity
  orcs: <orcs>,
  parkName: <parkName>,
  roles: [
    sysadmin,
    <orcs>:<subAreaId>
  ], // same roles as related subarea
  bundle: <bundle>,
  subAreaName: <subAreaName>,
  subAreaId: <subAreaId>,
  notes: notes,
  resolved: false, // whether or not the variance has been marked as resolved
  fields: [
    {
      key: <key>, // name of the field
      percentageChange: <number> // percentage (in decimals) of the variance
    }
  ] // list of fields that have triggered a variance and what that variance is
}
```
