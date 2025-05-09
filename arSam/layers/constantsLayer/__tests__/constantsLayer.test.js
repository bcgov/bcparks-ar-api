describe("Constants Test", () => {
    const OLD_ENV = process.env;
    beforeEach(async () => {
      jest.resetModules();
      process.env = { ...OLD_ENV }; // Make a copy of environment
    });
  
    test("Handler - Constants has items", async () => {
  
      const constants = require("../constantsLayer");
      // Checks to ensure the value functions returns the data we pass through to it based on the attribute.
      expect(constants.CSV_SYSADMIN_SCHEMA.length).toEqual(98);
      for(const row of constants.CSV_SYSADMIN_SCHEMA) {
        expect(row.value({
          region: 1,
          section: 1,
          bundle: 1,
          parkName: 1,
          orcs: 1,
          subAreaName: 1,
          subAreaId: 1,
          year: 1,
          fiscalYear: 1,
          month: 1,
          winterCampingPartyNightsAttendanceStandard: 1,
          winterCampingPartyNightsAttendanceSocial: 1,
          campingPartyNightsAttendanceStandard: 1,
          campingPartyNightsAttendanceSenior: 1,
          campingPartyNightsAttendanceSocial: 1,
          campingPartyNightsAttendanceLongStay: 1,
          calc_frontCountryCamping_frontCountryCamping_campingPartyNights_totalNights: 1,
          calc_frontCountryCamping_frontCountryCamping_campingPartyNights_totalAttendance: 1,
          campingPartyNightsRevenueGross: 1,
          calc_frontCountryCamping_campingPartyNights_netRevenue: 1,
          secondCarsAttendanceStandard: 1,
          secondCarsAttendanceSenior: 1,
          secondCarsAttendanceSocial: 1,
          calc_frontCountryCamping_secondCars_totalAttendance: 1,
          secondCarsRevenueGross: 1,
          calc_frontCountryCamping_secondCars_netRevenue: 1,
          otherRevenueGrossSani: 1,
          calc_frontCountryCamping_other_sani_netRevenue: 1,
          otherRevenueElectrical: 1,
          calc_frontCountryCamping_other_electrical_netRevenue: 1,
          otherRevenueShower: 1,
          calc_frontCountryCamping_other_shower_netRevenue: 1,
          notes_frontcountryCamping: 1,
          totalAttendanceParties: 1,
          calc_frontcountryCabins_parties_totalAttendance: 1,
          revenueGrossCamping: 1,
          calc_frontcountryCabins_camping_netRevenue: 1,
          notes_frontcountryCabins: 1,
          standardRateGroupsTotalPeopleStandard: 1,
          standardRateGroupsTotalPeopleAdults: 1,
          standardRateGroupsTotalPeopleYouth: 1,
          standardRateGroupsTotalPeopleKids: 1,
          calc_groupCamping_standardRate_totalPeople: 1,
          standardRateGroupsRevenueGross: 1,
          calc_groupCamping_standardRate_netRevenue: 1,
          youthRateGroupsAttendanceGroupNights: 1,
          youthRateGroupsAttendancePeople: 1,
          youthRateGroupsRevenueGross: 1,
          calc_groupCamping_youthRate_netRevenue: 1,
          notes_groupCamping: 1,
          calc_groupCamping_totalPeople: 1,
          calc_groupCamping_totalGrossRevenue: 1,
          calc_groupCamping_totalNetRevenue: 1,
          calc_frontcountry_totalAttendancePeople: 1,
          calc_frontcountry_totalGrossRevenue: 1,
          calc_frontcountry_totalNetRevenue: 1,
          people: 1,
          grossCampingRevenue: 1,
          calc_backcountryCamping_camping_netRevenue: 1,
          notes_backcountryCamping: 1,
          peopleAdult: 1,
          peopleChild: 1,
          peopleFamily: 1,
          calc_backcountryCabins_totalPeople: 1,
          revenueFamily: 1,
          calc_backcountryCabins_family_netRevenue: 1,
          notes_backcountryCabins: 1,
          calc_backcountry_totalAttendancePeople: 1,
          calc_backcountry_totalGrossRevenue: 1,
          calc_backcountry_totalNetRevenue: 1,
          calc_totalCampingAttendancePeople: 1,
          calc_totalCampingGrossRevenue: 1,
          calc_totalCampingNetRevenue: 1,
          peopleAndVehiclesVehicle: 1,
          peopleAndVehiclesBus: 1,
          peopleAndVehiclesTrail: 1,
          calc_dayUse_peopleAndVehicles_vehicleAttendance: 1,
          picnicRevenueShelter: 1,
          picnicShelterPeople: 1,
          picnicRevenueGross: 1,
          calc_dayUse_picnicShelters_netRevenue: 1,
          otherDayUsePeopleHotSprings: 1,
          otherDayUseRevenueHotSprings: 1,
          calc_dayUse_otherDayUse_netRevenue: 1,
          notes_dayUse: 1,
          calc_dayUse_totalAttendancePeople: 1,
          calc_dayUse_totalGrossRevenue: 1,
          calc_dayUse_totalNetRevenue: 1,
          boatAttendanceNightsOnDock: 1,
          boatAttendanceNightsOnBouys: 1,
          boatAttendanceMiscellaneous: 1,
          calc_boating_boats_boatAttendance: 1,
          boatRevenueGross: 1,
          calc_boating_boats_netRevenue: 1,
          notes_boating: 1,
          calc_totalAttendancePeople: 1,
          calc_totalGrossRevenue: 1,
          calc_totalNetRevenue: 1
        })).toEqual(1);
      }
    });
  });
  