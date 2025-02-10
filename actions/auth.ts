"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { headers } from "next/headers";
import { stat } from "fs";

export async function getUserSession() {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getSession();

    if (error) {
        return null
    }

    return {
        status: "success",
        user: data.session?.user
    }
}

export async function signUp(formData: FormData) {
    const supabase = await createClient();

    const credentials = {
        username: formData.get("username") as string,
        email: formData.get("email") as string,
        password: formData.get("password") as string,
    }

    const { error, data } = await supabase.auth.signUp({
        email: credentials.email,
        password: credentials.password,
        options: {
            data: {
                username: credentials.username,
            }
        }
    });

    if (error) {
        return {
            status: error?.status,
            user: null
        }
    } else if (data?.user?.identities?.length === 0) {
        return {
            status: "User witht his email already exists",
            user: null
        }
    }

    revalidatePath("/", "layout");
    return { status: "success", user: data.user }
}

export async function signIn(formData: FormData) {
    const supabase = await createClient();

    const credentials = {
        email: formData.get("email") as string,
        password: formData.get("password") as string,
    }

    const { error, data } = await supabase.auth.signInWithPassword(credentials)

    if (error) {
        return {
            status: error?.message,
            user: null
        }
    }

    const { data: existingUser } = await supabase.from("user_profiles").select("*").eq("email", credentials?.email).limit(1).single();

    if (!existingUser) {
        const { error: insertError } = await supabase.from("user_profiles").insert({
            email: data?.user.email,
            username: data?.user?.user_metadata?.username,
        })

        if (insertError) {
            return {
                status: insertError?.message,
                user: null
            }
        }
    }

    revalidatePath("/", "layout");
    return { status: "success", user: data.user }
}

export async function signOut() {
    const supabase = await createClient();

    const { error } = await supabase.auth.signOut();

    if (error) {
        redirect("/error");
    }

    revalidatePath("/", "layout");
    redirect("/login");
}

export async function signInWithGithub() {
    const origin = (await headers()).get("origin");
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
            redirectTo: `${origin}/auth/callback`,
        },
    })

    if (error) {
        redirect("/error");
    } else if (data.url) {
        return redirect(data.url);
    }
}

export async function forgotPassword(formData: FormData) {
    const supabase = await createClient();
    const origin = (await headers()).get("origin");

    const { error } = await supabase.auth.resetPasswordForEmail(
        formData.get("email") as string,
        {
            redirectTo: `${origin}/reset-password`
        })

    if (error) {
        return {
            status: error?.message,
            user: null
        }
    }

    return {
        status: "success",
    }
}

export async function resetPassword(formData: FormData, code: string) {
    const supabase = await createClient();
    const { error: codeError } = await supabase.auth.exchangeCodeForSession(code);

    if (codeError) {
        return {
            status: codeError?.message,
        }
    }

    const { error } = await supabase.auth.updateUser({
        password: formData.get("password") as string,
    })

    if (error) {
        return { status: error?.message }
    }

    return { status: "success" }
}