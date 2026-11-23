-- A Facebook Page connected with a Page token is stored as an account row with
-- provider FACEBOOK. Adding an enum value leaves every existing row untouched.

-- AlterEnum
ALTER TYPE "InstagramProvider" ADD VALUE 'FACEBOOK';
