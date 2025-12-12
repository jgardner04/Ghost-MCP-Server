import { describe, it, expect } from 'vitest';
import {
  createMemberSchema,
  updateMemberSchema,
  memberQuerySchema,
  memberIdSchema,
  memberEmailSchema,
  memberOutputSchema,
  labelOutputSchema,
  newsletterOutputSchema,
  memberSubscriptionSchema,
} from '../memberSchemas.js';

describe('Member Schemas', () => {
  describe('createMemberSchema', () => {
    it('should accept valid member creation data', () => {
      const validMember = {
        email: 'member@example.com',
        name: 'John Doe',
        subscribed: true,
      };

      expect(() => createMemberSchema.parse(validMember)).not.toThrow();
    });

    it('should accept minimal member creation data (email only)', () => {
      const minimalMember = {
        email: 'minimal@example.com',
      };

      const result = createMemberSchema.parse(minimalMember);
      expect(result.email).toBe('minimal@example.com');
      expect(result.subscribed).toBe(true); // default
      expect(result.comped).toBe(false); // default
    });

    it('should accept member with all fields', () => {
      const fullMember = {
        email: 'full@example.com',
        name: 'Jane Smith',
        note: 'VIP customer',
        subscribed: true,
        comped: true,
        labels: ['vip', 'newsletter'],
        newsletters: ['507f1f77bcf86cd799439011'],
      };

      expect(() => createMemberSchema.parse(fullMember)).not.toThrow();
    });

    it('should reject member without email', () => {
      const invalidMember = {
        name: 'No Email',
      };

      expect(() => createMemberSchema.parse(invalidMember)).toThrow();
    });

    it('should reject member with invalid email', () => {
      const invalidMember = {
        email: 'not-an-email',
      };

      expect(() => createMemberSchema.parse(invalidMember)).toThrow();
    });

    it('should reject member with too long name', () => {
      const invalidMember = {
        email: 'test@example.com',
        name: 'A'.repeat(192),
      };

      expect(() => createMemberSchema.parse(invalidMember)).toThrow();
    });

    it('should reject member with too long note', () => {
      const invalidMember = {
        email: 'test@example.com',
        note: 'A'.repeat(2001),
      };

      expect(() => createMemberSchema.parse(invalidMember)).toThrow();
    });

    it('should reject member with invalid newsletter ID', () => {
      const invalidMember = {
        email: 'test@example.com',
        newsletters: ['invalid-id'],
      };

      expect(() => createMemberSchema.parse(invalidMember)).toThrow();
    });
  });

  describe('updateMemberSchema', () => {
    it('should accept partial member updates', () => {
      const update = {
        name: 'Updated Name',
      };

      expect(() => updateMemberSchema.parse(update)).not.toThrow();
    });

    it('should accept empty update object', () => {
      expect(() => updateMemberSchema.parse({})).not.toThrow();
    });

    it('should accept full member update', () => {
      const update = {
        email: 'updated@example.com',
        name: 'Updated Name',
        note: 'Updated note',
        subscribed: false,
      };

      expect(() => updateMemberSchema.parse(update)).not.toThrow();
    });
  });

  describe('memberQuerySchema', () => {
    it('should accept valid query parameters', () => {
      const query = {
        limit: 20,
        page: 2,
        filter: 'status:paid+subscribed:true',
      };

      expect(() => memberQuerySchema.parse(query)).not.toThrow();
    });

    it('should accept query with include parameter', () => {
      const query = {
        include: 'labels,newsletters',
      };

      expect(() => memberQuerySchema.parse(query)).not.toThrow();
    });

    it('should accept query with search parameter', () => {
      const query = {
        search: 'john',
        limit: 10,
      };

      expect(() => memberQuerySchema.parse(query)).not.toThrow();
    });

    it('should accept query with order parameter', () => {
      const query = {
        order: 'created_at DESC',
      };

      expect(() => memberQuerySchema.parse(query)).not.toThrow();
    });

    it('should reject query with invalid filter characters', () => {
      const query = {
        filter: 'status;DROP TABLE',
      };

      expect(() => memberQuerySchema.parse(query)).toThrow();
    });

    it('should accept empty query object', () => {
      const result = memberQuerySchema.parse({});
      expect(result).toBeDefined();
    });
  });

  describe('memberIdSchema', () => {
    it('should accept valid Ghost ID', () => {
      const validId = {
        id: '507f1f77bcf86cd799439011',
      };

      expect(() => memberIdSchema.parse(validId)).not.toThrow();
    });

    it('should reject invalid Ghost ID', () => {
      const invalidId = {
        id: 'invalid-id',
      };

      expect(() => memberIdSchema.parse(invalidId)).toThrow();
    });
  });

  describe('memberEmailSchema', () => {
    it('should accept valid email', () => {
      const validEmail = {
        email: 'test@example.com',
      };

      expect(() => memberEmailSchema.parse(validEmail)).not.toThrow();
    });

    it('should reject invalid email', () => {
      const invalidEmail = {
        email: 'not-an-email',
      };

      expect(() => memberEmailSchema.parse(invalidEmail)).toThrow();
    });
  });

  describe('labelOutputSchema', () => {
    it('should accept valid label output from Ghost API', () => {
      const apiLabel = {
        id: '507f1f77bcf86cd799439011',
        name: 'VIP',
        slug: 'vip',
        created_at: '2024-01-15T10:30:00.000Z',
        updated_at: '2024-01-15T10:30:00.000Z',
      };

      expect(() => labelOutputSchema.parse(apiLabel)).not.toThrow();
    });

    it('should reject label output without required fields', () => {
      const invalidLabel = {
        name: 'VIP',
        slug: 'vip',
      };

      expect(() => labelOutputSchema.parse(invalidLabel)).toThrow();
    });
  });

  describe('newsletterOutputSchema', () => {
    it('should accept valid newsletter output from Ghost API', () => {
      const apiNewsletter = {
        id: '507f1f77bcf86cd799439011',
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Weekly Newsletter',
        description: 'Our weekly updates',
        slug: 'weekly-newsletter',
        sender_name: 'Blog Team',
        sender_email: 'team@example.com',
        sender_reply_to: 'newsletter',
        status: 'active',
        visibility: 'members',
        subscribe_on_signup: true,
        sort_order: 0,
        header_image: null,
        show_header_icon: true,
        show_header_title: true,
        title_font_category: 'sans-serif',
        title_alignment: 'center',
        show_feature_image: true,
        body_font_category: 'sans-serif',
        footer_content: null,
        show_badge: true,
        created_at: '2024-01-15T10:30:00.000Z',
        updated_at: '2024-01-15T10:30:00.000Z',
      };

      expect(() => newsletterOutputSchema.parse(apiNewsletter)).not.toThrow();
    });
  });

  describe('memberSubscriptionSchema', () => {
    it('should accept valid subscription object', () => {
      const subscription = {
        id: 'sub_123',
        customer: {
          id: 'cus_123',
          name: 'John Doe',
          email: 'john@example.com',
        },
        plan: {
          id: 'plan_123',
          nickname: 'Monthly Premium',
          amount: 999,
          interval: 'month',
          currency: 'USD',
        },
        status: 'active',
        start_date: '2024-01-15T10:30:00.000Z',
        current_period_end: '2024-02-15T10:30:00.000Z',
        cancel_at_period_end: false,
        cancellation_reason: null,
        trial_start_date: null,
        trial_end_date: null,
      };

      expect(() => memberSubscriptionSchema.parse(subscription)).not.toThrow();
    });

    it('should accept subscription with trial dates', () => {
      const subscription = {
        id: 'sub_123',
        customer: {
          id: 'cus_123',
          name: null,
          email: 'test@example.com',
        },
        plan: {
          id: 'plan_123',
          nickname: 'Yearly Premium',
          amount: 9999,
          interval: 'year',
          currency: 'EUR',
        },
        status: 'trialing',
        start_date: '2024-01-15T10:30:00.000Z',
        current_period_end: '2024-02-15T10:30:00.000Z',
        cancel_at_period_end: false,
        cancellation_reason: null,
        trial_start_date: '2024-01-15T10:30:00.000Z',
        trial_end_date: '2024-01-22T10:30:00.000Z',
      };

      expect(() => memberSubscriptionSchema.parse(subscription)).not.toThrow();
    });

    it('should reject subscription with invalid status', () => {
      const subscription = {
        id: 'sub_123',
        customer: {
          id: 'cus_123',
          email: 'test@example.com',
        },
        plan: {
          id: 'plan_123',
          nickname: 'Monthly',
          amount: 999,
          interval: 'month',
          currency: 'USD',
        },
        status: 'invalid_status',
        start_date: '2024-01-15T10:30:00.000Z',
        current_period_end: '2024-02-15T10:30:00.000Z',
        cancel_at_period_end: false,
      };

      expect(() => memberSubscriptionSchema.parse(subscription)).toThrow();
    });
  });

  describe('memberOutputSchema', () => {
    it('should accept valid member output from Ghost API', () => {
      const apiMember = {
        id: '507f1f77bcf86cd799439011',
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        email: 'member@example.com',
        name: 'John Doe',
        note: 'VIP customer',
        geolocation: 'US',
        enable_comment_notifications: true,
        email_count: 10,
        email_opened_count: 8,
        email_open_rate: 0.8,
        status: 'paid',
        created_at: '2024-01-15T10:30:00.000Z',
        updated_at: '2024-01-15T10:30:00.000Z',
        subscribed: true,
        comped: false,
        email_suppression: null,
        labels: [],
        subscriptions: [],
        newsletters: [],
        avatar_image: 'https://example.com/avatar.jpg',
      };

      expect(() => memberOutputSchema.parse(apiMember)).not.toThrow();
    });

    it('should accept member with null optional fields', () => {
      const apiMember = {
        id: '507f1f77bcf86cd799439011',
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        email: 'test@example.com',
        name: null,
        note: null,
        geolocation: null,
        enable_comment_notifications: false,
        email_count: 0,
        email_opened_count: 0,
        email_open_rate: null,
        status: 'free',
        created_at: '2024-01-15T10:30:00.000Z',
        updated_at: '2024-01-15T10:30:00.000Z',
        subscribed: false,
        comped: false,
        email_suppression: null,
        avatar_image: null,
      };

      expect(() => memberOutputSchema.parse(apiMember)).not.toThrow();
    });

    it('should accept member with email suppression', () => {
      const apiMember = {
        id: '507f1f77bcf86cd799439011',
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        email: 'suppressed@example.com',
        name: 'Suppressed User',
        note: null,
        geolocation: null,
        enable_comment_notifications: false,
        email_count: 5,
        email_opened_count: 0,
        email_open_rate: 0,
        status: 'free',
        created_at: '2024-01-15T10:30:00.000Z',
        updated_at: '2024-01-15T10:30:00.000Z',
        subscribed: false,
        comped: false,
        email_suppression: {
          suppressed: true,
          info: 'User unsubscribed',
        },
        avatar_image: null,
      };

      expect(() => memberOutputSchema.parse(apiMember)).not.toThrow();
    });

    it('should reject member output with invalid status', () => {
      const invalidMember = {
        id: '507f1f77bcf86cd799439011',
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        email: 'test@example.com',
        name: 'Test',
        enable_comment_notifications: true,
        email_count: 0,
        email_opened_count: 0,
        status: 'invalid_status',
        created_at: '2024-01-15T10:30:00.000Z',
        updated_at: '2024-01-15T10:30:00.000Z',
        subscribed: false,
        comped: false,
      };

      expect(() => memberOutputSchema.parse(invalidMember)).toThrow();
    });

    it('should reject member output without required fields', () => {
      const invalidMember = {
        email: 'test@example.com',
        name: 'Test',
      };

      expect(() => memberOutputSchema.parse(invalidMember)).toThrow();
    });
  });
});
