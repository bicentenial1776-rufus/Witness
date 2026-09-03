/** Leading title-case name tokens of a line, or null when it isn't a name line. */
export declare function readName(line: string): {
    given: string;
    surname: string;
    rest: string;
} | null;
