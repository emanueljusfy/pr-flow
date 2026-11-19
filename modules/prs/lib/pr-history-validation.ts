import { z } from "zod";

export const prHistoryQuerySchema = z.object({
  repository: z
    .string()
    .trim()
    .regex(/^[^/]+\/[^/]+$/, "Repositório inválido. Use owner/repo."),
  number: z.coerce.number().int().positive("Número da PR inválido.")
});

export type PrHistoryQuery = z.infer<typeof prHistoryQuerySchema>;

const graphqlActorSchema = z
  .object({
    login: z.string().nullable().optional()
  })
  .nullable()
  .optional();

const graphqlCommitSchema = z
  .object({
    oid: z.string().nullable().optional(),
    committedDate: z.string().nullable().optional(),
    messageHeadline: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    author: z
      .object({
        user: z
          .object({
            login: z.string().nullable().optional()
          })
          .nullable()
          .optional(),
        name: z.string().nullable().optional()
      })
      .nullable()
      .optional()
  })
  .nullable()
  .optional();

export const prHistoryGraphqlTimelineNodeSchema = z
  .object({
    __typename: z.string().nullable().optional(),
    id: z.string().nullable().optional(),
    createdAt: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    body: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
    author: graphqlActorSchema,
    actor: graphqlActorSchema,
    commit: graphqlCommitSchema
  })
  .nullable();

export const prHistoryGraphqlPullRequestSchema = z.object({
  id: z.string().nullable().optional(),
  number: z.number().nullable().optional(),
  url: z.string().nullable().optional(),
  createdAt: z.string().nullable().optional(),
  author: graphqlActorSchema,
  timelineItems: z
    .object({
      nodes: z.array(prHistoryGraphqlTimelineNodeSchema).nullable().optional()
    })
    .nullable()
    .optional()
});

export const prHistoryGraphqlResponseSchema = z.object({
  data: z
    .object({
      repository: z
        .object({
          pullRequest: prHistoryGraphqlPullRequestSchema.nullable().optional()
        })
        .nullable()
        .optional()
    })
    .nullable()
    .optional(),
  errors: z
    .array(
      z.object({
        message: z.string()
      })
    )
    .optional()
});
