'use server';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { getDb } from '@/db';
import { answerQuestion, askQuestion, reviewSolution } from '@/server/tasks/activity';
import { confirmTask, requestChanges } from '@/server/tasks/service';
import { run, str, type FormState } from '../_lib/action';
import { getActor } from '../_lib/actor';

type ToastKey = 'toastConfirmed' | 'toastChangesRequested' | 'toastAnswered' | 'toastAsked' | 'toastReviewed';

const done = async (taskId: string, toast: ToastKey): Promise<FormState> => {
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath('/');
  return { ok: (await getTranslations('task'))(toast) };
};

export async function confirmAction(_p: FormState, form: FormData): Promise<FormState> {
  const actor = await getActor();
  const taskId = str(form, 'taskId');
  return run(async () => {
    await confirmTask(getDb(), actor, taskId);
    return done(taskId, 'toastConfirmed');
  });
}

export async function requestChangesAction(_p: FormState, form: FormData): Promise<FormState> {
  const actor = await getActor();
  const taskId = str(form, 'taskId');
  return run(async () => {
    await requestChanges(getDb(), actor, taskId, str(form, 'note'));
    return done(taskId, 'toastChangesRequested');
  });
}

export async function answerAction(_p: FormState, form: FormData): Promise<FormState> {
  const actor = await getActor();
  const taskId = str(form, 'taskId');
  return run(async () => {
    await answerQuestion(getDb(), actor, str(form, 'questionId'), str(form, 'answer'));
    return done(taskId, 'toastAnswered');
  });
}

export async function askAction(_p: FormState, form: FormData): Promise<FormState> {
  const actor = await getActor();
  const taskId = str(form, 'taskId');
  return run(async () => {
    await askQuestion(getDb(), actor, taskId, str(form, 'body'), { isBlocker: false });
    return done(taskId, 'toastAsked');
  });
}

export async function reviewAction(_p: FormState, form: FormData): Promise<FormState> {
  const actor = await getActor();
  const taskId = str(form, 'taskId');
  const verdict = str(form, 'verdict') === 'approved' ? 'approved' : 'changes_needed';
  return run(async () => {
    await reviewSolution(getDb(), actor, taskId, verdict, str(form, 'note') || undefined);
    return done(taskId, 'toastReviewed');
  });
}
