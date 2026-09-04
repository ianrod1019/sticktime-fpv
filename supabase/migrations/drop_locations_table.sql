/*
      # Drop locations table and remove location references

      1. Changes
        - Drop `locations` table if it exists safely
        - Drop any foreign key constraints or column references if needed
    */

    DROP TABLE IF EXISTS locations CASCADE;
