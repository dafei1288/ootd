'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { insertTopic, retryPost, deletePost } from '@/lib/db';
import { generateTopics, runPipeline } from '@/lib/pipeline/run';

async function authed() {
  return !!process.env.ADMIN_TOKEN && (await cookies()).get('admin')?.value === process.env.ADMIN_TOKEN;
}

export async function login(formData: FormData) {
  const token = String(formData.get('token') ?? '');
  if (token && token === process.env.ADMIN_TOKEN) {
    (await cookies()).set('admin', token, { httpOnly: true, sameSite: 'lax', path: '/' });
  }
  revalidatePath('/admin');
}

export async function logout() {
  (await cookies()).delete('admin');
  revalidatePath('/admin');
}

export async function importTopics(formData: FormData) {
  if (!(await authed())) return;
  const text = String(formData.get('topics') ?? '');
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t) insertTopic(t, 'manual');
  }
  await runPipeline();
  revalidatePath('/admin');
}

export async function genTopicsAction(formData: FormData) {
  if (!(await authed())) return;
  const n = Math.min(10, Math.max(1, Number(formData.get('n') ?? 1)));
  const hint = String(formData.get('hint') ?? '').trim() || undefined;
  await generateTopics(n, hint);
  await runPipeline();
  revalidatePath('/admin');
}

export async function runAction() {
  if (!(await authed())) return;
  await runPipeline();
  revalidatePath('/admin');
}

export async function retryAction(formData: FormData) {
  if (!(await authed())) return;
  retryPost(Number(formData.get('id')));
  revalidatePath('/admin');
}

export async function deleteAction(formData: FormData) {
  if (!(await authed())) return;
  deletePost(Number(formData.get('id')));
  revalidatePath('/admin');
}
