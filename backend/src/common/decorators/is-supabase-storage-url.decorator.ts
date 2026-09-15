import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

const SUPABASE_STORAGE_RE =
  /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/([^/]+)\/.+$/;

export interface IsSupabaseStorageUrlOptions extends ValidationOptions {
  allowedBuckets?: string[];
}

export function IsSupabaseStorageUrl(
  opts: IsSupabaseStorageUrlOptions = { allowedBuckets: [] },
): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'IsSupabaseStorageUrl',
      target: object.constructor,
      propertyName: propertyName as string,
      options: opts,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          const match = value.match(SUPABASE_STORAGE_RE);
          if (!match) return false;
          const bucket = match[1];
          return (opts.allowedBuckets ?? []).includes(bucket);
        },
        defaultMessage({ property }: ValidationArguments): string {
          const buckets = opts.allowedBuckets ?? [];
          return buckets.length > 0
            ? `${property} debe ser una URL válida del bucket de Supabase Storage (${buckets.join(
                ' o ',
              )}).`
            : `${property} debe ser una URL válida del bucket de Supabase Storage.`;
        },
      },
    });
  };
}
