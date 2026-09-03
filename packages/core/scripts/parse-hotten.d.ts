export interface Entry {
    given: string;
    surname: string;
    birth: string;
    notes: string;
}
/**
 * Passenger entries on one register line. A line may hold several people
 * joined by '&' ("EDMOND WEAVER 28 yers & his wife MARGRETT aged 30");
 * a lone given name inherits the surname of the person before it, and an
 * age becomes a derived birth year ("c. 1607").
 */
export declare function extractEntries(line: string, year: number, lastSurname: string): {
    entries: Entry[];
    lastSurname: string;
};
