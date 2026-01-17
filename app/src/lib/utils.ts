import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Sleep helper - returns a promise that resolves after the specified time
 * @param ms - milliseconds to sleep
 * @returns Promise that resolves after ms milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Formats an unknown error into a user-friendly error message string.
 * Handles Error objects, strings, and other unknown types.
 * @param error - The error to format (can be any type)
 * @returns A string representation of the error message
 */
export function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
