# Splash planning and chemistry resources

Source list reviewed for Splash: 20 September 2026.

Splash is a garden playpool and hot-tub planning tool. Its calculations and chemistry guidance are planning estimates, not safety-critical instructions. The chemistry bot must not calculate chemical dosing quantities and must direct users to product labels, manufacturer instructions or a qualified pool technician for dosing.

## Weather, solar and climate data

Open-Meteo (2026) Geocoding API. Available at: https://geocoding-api.open-meteo.com/v1/search (Accessed: 20 September 2026).

Open-Meteo (2026) Forecast API. Available at: https://api.open-meteo.com/v1/forecast (Accessed: 20 September 2026).

Open-Meteo (2026) Historical Weather API. Available at: https://archive-api.open-meteo.com/v1/archive (Accessed: 20 September 2026).

## Chemistry and pool product guidance

Clorox Pool and Spa (2026) Pool care learning centre. Available at: https://www.cloroxpool.com/learn/ (Accessed: 20 September 2026).

Clorox Pool and Spa (2026) Pool volume calculator. Available at: https://www.cloroxpool.com/pool-volume-calculator/ (Accessed: 20 September 2026).

Clorox Pool and Spa (2020) How to raise and lower pH in swimming pools. Available at: https://www.cloroxpool.com/blog/2020/03/25/how-to-raise-and-lower-ph-in-swimming-pools/ (Accessed: 20 September 2026).

Bestway (2026) Product FAQ: pool maintenance and chemicals. Available at: https://m.bestwaycorp.co.uk/Productfaq?SubCategoryId=12&merno= (Accessed: 20 September 2026).

Lovibond (2026) Pool Water Control. Available at: https://www.lovibond.com/usa-en/PW/Water-Testing/Applications/Pool-Water-Control (Accessed: 20 September 2026).

## Local app references

Jahosi (2026) Splash appendices: formulas and validated reference sources. Available at: https://jahosi.co.uk/splash/appendices.htm (Accessed: 20 September 2026).

Jahosi (2026) Splash app README. Available at: https://jahosi.co.uk/splash/README.md (Accessed: 20 September 2026).

## Chemistry bot safety boundaries

The chemistry bot may:

- explain what a chemical or test reading means
- explain direction of travel, such as pH too high or free chlorine too low
- ask for missing context, such as test readings, chlorine type or cover use
- direct users to official product labels and manufacturer calculators
- use symbolic formulas with variable names only

The chemistry bot must not:

- calculate chemical quantities
- substitute user numbers into dosing formulas
- produce worked dosing examples
- recommend mixing chemicals directly
- recommend unsafe chlorine levels
- override the app's chemistry card outputs
- present planning estimates as guaranteed temperatures, costs or safe water conditions
