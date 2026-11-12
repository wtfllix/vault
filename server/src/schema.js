export const text = (maxLength = 255, minLength = 0) => ({ type: 'string', minLength, maxLength });
export const object = (properties, required = Object.keys(properties)) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required
});
export const uuid = { type: 'string', format: 'uuid' };
export const secretId = { type: 'string', pattern: '^[1-9][0-9]{0,17}$' };
export const params = (id = uuid) => ({ params: object({ id }) });
export const password = text(256, 1);
export const newPassword = text(256, 12);
export const pagination = {
  limit: { type: 'integer', minimum: 1, maximum: 200, default: 100 },
  offset: { type: 'integer', minimum: 0, maximum: 100000, default: 0 }
};
export const metadata = {
  name: text(255, 1),
  tags: { type: 'array', maxItems: 20, uniqueItems: true, items: text(40, 1) },
  environment: text(40),
  favorite: { type: 'boolean' }
};
export const languages = ['text', 'markdown', 'json', 'yaml', 'shell', 'javascript', 'python'];
export const secretTypes = [
  'apikey',
  'ssh',
  'password',
  'database',
  'custom',
  'long_text',
  'config_file'
];
export const secretBody = object(
  {
    ...metadata,
    secret_type: { type: 'string', enum: secretTypes },
    note: text(10000),
    data: {
      type: 'object',
      maxProperties: 40,
      additionalProperties: {
        anyOf: [text(15000000), { type: 'number' }, { type: 'boolean' }, { type: 'null' }]
      }
    },
    version: { type: 'integer', minimum: 1 }
  },
  ['secret_type', 'name', 'data']
);
