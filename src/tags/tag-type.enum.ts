export enum TagType {
  STAGE = 'STAGE',
  ORIGIN = 'ORIGIN',
  TEMP = 'TEMP',
  ACTION = 'ACTION',
  SYNC = 'SYNC',
}

export const TAG_TYPE_PREFIXES: Record<string, TagType> = {
  stage: TagType.STAGE,
  origin: TagType.ORIGIN,
  temp: TagType.TEMP,
  action: TagType.ACTION,
  sync: TagType.SYNC,
};
