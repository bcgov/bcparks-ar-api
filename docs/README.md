# A&R Data Structure

This document is intended to describe how the [data model](data_model.json) for various items in the database are structured. It should help you construct a `pk/sk` query for your needs.

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
      id: <subAreaId>,
      isLegacy: false
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

When a new activity record is created, the relevant config object is used as a starting template. In other words, an activity object is in part a snapshot of a config for a particular month.

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
# Legacy Data

BC Parks attendance and revenue data was previously tracked in an Excel document containing data that can be traced back to the year 2000. A modernized replacement system was proposed to track these data.

The MVP for the modernized A&R System included the creation and management of monthly activity records for subareas within umbrella of parks run by BC Parks. MVP included considerations for the following activities:

* [Backcountry Cabins](#backcountry-cabins-activity-record---specific-fields)
* [Backcountry Camping](#backcountry-camping-activity-record---specific-fields)
* [Boating](#boating-activity-record---specific-fields)
* [Day Use](#day-use-activity-record---specific-fields)
* [Group Camping](#group-camping-activity-record---specific-fields)
* [Frontcountry Cabins](#frontcountry-cabins-activity-record---specific-fields)
* [Frontcountry Camping](#frontcountry-camping-activity-record---specific-fields)

Each collected property related to one of the above activity categories. You can view the specific properties by reviewing the [Activity Records](#activity-records) section.

## Migration of legacy data

When it came time to migrate over the existing data from the Excel document, it was discovered that though most of the properties in the Excel document related to one of the above activity categories, not all of them were already captured by the data model schema that the modernized system currently enforced. Furthermore, there were a handful of properties that did not relate to any existing activity. This meant there was an incongruency between modern data that the new A&R system was collecting and the legacy data contained within the Excel document. This left a handful of complicated options available to proceed with the migration of legacy data:

* Adapt the data model currently in-use by the modern A&R system to use the exact data model from the Excel document. This was not favorable as it required both a large migration and fundamentally changing the already-functioning system, introducing significant risk. Furthermore, the exact data model of the Excel document could not be decided as there were inconsistencies within the Excel data itself.
* Only migrate over properties from the Excel document that could be definitively 1:1 mapped to properties in the modern system. This also was not favorable as it involved discarding a large portion of Excel data, and making assumptions on which historical property mapped to which modern property, compromising what integrity the Excel data had.
* A hybrid implementation of the first two options, where properties that could be definitively 1:1 mapped were brought over into the modern system, and new properties were created where mapping fell short. Each migrated record would be flagged as `isLegacy` for quick identification in the event we needed to separate historical data from modern data. 

Proceeding with the hybrid implementation, a new activity was introduced exclusively for migrated activity records that captured any property that did not fall into an existing activity category:

* Legacy Data

Currently, only the years from 2017-2019 represented in the Excel document have been brought over [#971](https://bcparksdigital.atlassian.net/browse/BRS-971).

[Migration itinerary](legacy_migration_itinerary_2017-2019.pdf) - developer description of how the migration for legacy data from 2017-2019 was achieved.
[Business approval](legacy_data_migration_business_approval.pdf) - business acknowledgement of assumptions taken in the 2017-2019 migration.

See [#237](https://github.com/bcgov/bcparks-ar-api/issues/237) and [#680](https://bcparksdigital.atlassian.net/browse/BRS-680) for more.

## Differences in modern and legacy data

The fundamental rule about migrating the legacy Excel data was this: "If the legacy data changes in any way, it is no longer legacy". In other words, once a party alters migrated data from how it is originally defined in the Excel document, that party assumes responsibility for the altered data's integrity and reliability. Several steps were taken to ensure the modern A&R system could be used as a source of truth for legacy data without altering the integrity and reliability of the original Excel document.

Initially, all data with an `isLegacy` flag was locked against editing.

### Legacy Parks

It was assumed that all parks that would continue to collect attendance and revenue data were present in the modern A&R system before migration. Therefore, any park present only in the migration would be created in the modern system with an `isLegacy` flag.

As later determined in [#250](https://github.com/bcgov/bcparks-ar-admin/issues/250), parks that were created as as `isLegacy` still may collect attendance and revenue data. 

### Legacy Subareas

It was assumed that all subareas that would continue to collect attendance and revenue data were present in the modern A&R system before migration. Therefore, any subarea present only in the migration would be created in the modern system with an `isLegacy` flag.

Later, it was requested that some of these subareas get reopened for collecting attendance and revenue data again. Instead of removing the `isLegacy` flag on the subarea, it was decided in these cases a new subarea would be created using the modern A&R system and further attendance and revenue data would be recorded under the modern subarea. This prevents us from alterning legacy subareas. 

All legacy subareas include the `Legacy Data` activity regardless of whether the subarea has data in that category. 

### Legacy Configs

There are no config objects for legacy activities, as there is no need for an activity template. The modern A&R system will never create a modern activity record from a legacy config.

### Legacy Activity Records

In cases where properties of legacy data did not translate 1:1 into an existing modern data property, a new property was created. The field mapping for all fields can be found in the [ar-fieldmap](ar-fieldmap_2023-03-03.xlsx).

### Legacy Variance Records

Variances are currently calculated when a record is saved. Since a legacy record will never be updated/saved, there are no variance records that go back as far as 2019.
Variance records compare data from activities spanning the previous 3 years. They will include data from legacy records if it is available, but there is no need to track these variances as `isLegacy`. 

