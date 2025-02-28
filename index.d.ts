export function createServiceController<T extends {
    [K: string]: Service;
}, U extends string = keyof T & string>(services: T): {
    start: (name: U | U[] | undefined) => Promise<void>;
    stop: (name: U | U[] | undefined) => Promise<void>;
};
export type Service = {
    dependsOn?: string[];
    start: () => void;
    stop: () => void;
};
