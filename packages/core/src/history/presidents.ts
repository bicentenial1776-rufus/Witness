/**
 * United States presidencies, for the Family Stage's history wash —
 * the terms paint vertically behind the ribbons so an absence can be
 * read against who held the office. Facts, not styling.
 */

export interface Presidency {
  name: string;
  start: number;
  end: number;
}

export const PRESIDENCIES: readonly Presidency[] = [
  { name: 'Washington', start: 1789, end: 1797 },
  { name: 'J. Adams', start: 1797, end: 1801 },
  { name: 'Jefferson', start: 1801, end: 1809 },
  { name: 'Madison', start: 1809, end: 1817 },
  { name: 'Monroe', start: 1817, end: 1825 },
  { name: 'J.Q. Adams', start: 1825, end: 1829 },
  { name: 'Jackson', start: 1829, end: 1837 },
  { name: 'Van Buren', start: 1837, end: 1841 },
  { name: 'W.H. Harrison', start: 1841, end: 1841 },
  { name: 'Tyler', start: 1841, end: 1845 },
  { name: 'Polk', start: 1845, end: 1849 },
  { name: 'Taylor', start: 1849, end: 1850 },
  { name: 'Fillmore', start: 1850, end: 1853 },
  { name: 'Pierce', start: 1853, end: 1857 },
  { name: 'Buchanan', start: 1857, end: 1861 },
  { name: 'Lincoln', start: 1861, end: 1865 },
  { name: 'A. Johnson', start: 1865, end: 1869 },
  { name: 'Grant', start: 1869, end: 1877 },
  { name: 'Hayes', start: 1877, end: 1881 },
  { name: 'Garfield', start: 1881, end: 1881 },
  { name: 'Arthur', start: 1881, end: 1885 },
  { name: 'Cleveland', start: 1885, end: 1889 },
  { name: 'B. Harrison', start: 1889, end: 1893 },
  { name: 'Cleveland', start: 1893, end: 1897 },
  { name: 'McKinley', start: 1897, end: 1901 },
  { name: 'T. Roosevelt', start: 1901, end: 1909 },
  { name: 'Taft', start: 1909, end: 1913 },
  { name: 'Wilson', start: 1913, end: 1921 },
  { name: 'Harding', start: 1921, end: 1923 },
  { name: 'Coolidge', start: 1923, end: 1929 },
  { name: 'Hoover', start: 1929, end: 1933 },
  { name: 'F.D. Roosevelt', start: 1933, end: 1945 },
  { name: 'Truman', start: 1945, end: 1953 },
  { name: 'Eisenhower', start: 1953, end: 1961 },
  { name: 'Kennedy', start: 1961, end: 1963 },
  { name: 'L.B. Johnson', start: 1963, end: 1969 },
  { name: 'Nixon', start: 1969, end: 1974 },
  { name: 'Ford', start: 1974, end: 1977 },
  { name: 'Carter', start: 1977, end: 1981 },
  { name: 'Reagan', start: 1981, end: 1989 },
  { name: 'G.H.W. Bush', start: 1989, end: 1993 },
  { name: 'Clinton', start: 1993, end: 2001 },
  { name: 'G.W. Bush', start: 2001, end: 2009 },
  { name: 'Obama', start: 2009, end: 2017 },
  { name: 'Trump', start: 2017, end: 2021 },
  { name: 'Biden', start: 2021, end: 2025 },
  { name: 'Trump', start: 2025, end: 2029 },
];
