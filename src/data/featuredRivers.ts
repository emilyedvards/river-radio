export type FeaturedRiver = {
  riverName: string;
  location: string;
  stationId: string;
};

export const featuredRivers: FeaturedRiver[] = [
  {
    riverName: "Trinity River",
    location: "Dallas, Texas",
    stationId: "USGS-08057000",
  },
  {
    riverName: "Mississippi River",
    location: "Memphis, Tennessee",
    stationId: "USGS-07032000",
  },
  {
    riverName: "Hudson River",
    location: "Green Island, New York",
    stationId: "USGS-01358000",
  },
  {
    riverName: "Colorado River",
    location: "Grand Canyon, Arizona",
    stationId: "USGS-09402500",
  },
  {
    riverName: "Rio Grande",
    location: "Albuquerque, New Mexico",
    stationId: "USGS-08330000",
  },
  {
    riverName: "Columbia River",
    location: "Near Quincy, Oregon",
    stationId: "USGS-14246900",
  },
];
