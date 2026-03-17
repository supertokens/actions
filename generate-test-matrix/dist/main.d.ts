export type Rep = {
    version: string;
    branch: string;
    isExact: boolean;
    covers: string[];
};
export type InverseMap = Record<string, string>;
export type MatrixCell = Record<string, string>;
export declare function parseSemver(v: string): number[];
export declare function cmpSemver(a: string, b: string): number;
export declare function maxOf(versions: string[]): string;
export declare function resolveVersions(localVersions: string[], inverseMap: InverseMap): Rep[];
export declare function buildMatrix(fdiReps: Rep[], cdiReps: Rep[], extraAxes: Record<string, string[]>, latestExtraOverrides: Record<string, string>, strategy: string): MatrixCell[];
export declare function run(): Promise<void>;
