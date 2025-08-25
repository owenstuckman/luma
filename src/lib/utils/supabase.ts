import { createBrowserClient } from '@supabase/ssr'; 
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

/*

Utility functions for supabase.
- More or less all the db functions needed for the application 

 */

const supabase = createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY); // Updated to createBrowserClient

export const getActiveRoles = async () => {
    const { data, error } = await supabase
        .from("job_posting")
        .select('*');

    if (error) {
        console.error('Error fetching data:', error);
        throw new Error('Failed to fetch data from Supabase');
    }
    return data;
};

export const getRoleByID = async (id: number) => {
    const { data, error } = await supabase
        .from("job_posting")
        .select('*')
        .eq('id', id); // Filter by the provided id

    if (error) {
        console.error('Error fetching data:', error);
        throw new Error('Failed to fetch data from Supabase');
    }
    console.log(data);
    return data;
};

/*
            const applicationData = {
                name: formData.name,
                email: formData.email,
                recruitInfo: {} as { [key: string]: string }, 
                job: id,
            };
*/

export const sendApplication = async (row: object) => {
    const { data, error } = await supabase
        .from("applicants")
        .insert(row);

    if (error) {
        console.error('Error sending application:', error);
        throw new Error('Failed to send application to Supabase');
    }
    console.log(data);
    return data;


}

// pretty much hardcoded sending applications for this cycle.... can fix later 🤷
export const sendApplicationFall2025 = async (name: string, email: string, recruitInfo: { [key: string]: string }, job: 1) => {
    const applicationData = {
        name,
        email,
        recruitInfo,
        job,
    };

    const { data, error } = await supabase
        .from("applicants")
        .insert(applicationData);

    if (error) {
        console.error('Error sending application:', error);
        throw new Error('Failed to send application to Supabase');
    }
    console.log(data);
    return data;
}

export const getAllApplicants = async () => {
    const { data, error } = await supabase
        .from("applicants")
        .select('*')

    if (error) {
        console.error('Error sending application:', error);
        throw new Error('Failed to send application to Supabase');
    }
    console.log(data);
    return data;
}


export const getApplicantData = async (id: number) => {
    const { data, error } = await supabase
        .from("applicants")
        .select('*')
        .eq('id', id)
    if (error) {
        console.error('Error sending application:', error);
        throw new Error('Failed to send application to Supabase');
    }
    console.log(data);
    return data;
}

export const addComment = async (
    id: number,
    newID: number,
    comment: string,
    email: string,
    decision: string,
) => {
    // Step 1: Fetch existing applicant by ID
    const { data: applicantData, error: fetchError } = await supabase
        .from("applicants")
        .select("*")
        .eq("id", id)
        .limit(1);

    if (fetchError) {
        console.error("Error fetching applicant:", fetchError);
        throw new Error("Failed to fetch applicant");
    }

    if (!applicantData || applicantData.length === 0) {
        console.warn("No applicant found with ID:", id);
        throw new Error(`No applicant found with ID: ${id}`);
    }

    const currentComments = Array.isArray(applicantData[0].comments)
        ? applicantData[0].comments
        : [];

    const newComment = {
        id: newID,
        email: email,
        comment: comment,
        decision: decision,

    };


    const existingComments = Array.isArray(applicantData[0].comments.comments) ? applicantData[0].comments.comments : [];
    const updatedComments = {
        comments: [...existingComments, newComment]
    };

    // Ensure the updatedComments is formatted correctly as a JSON object
    const jsonFormattedComments = JSON.stringify(updatedComments);

    console.log(jsonFormattedComments);

    const { data, error: updateError } = await supabase
        .from("applicants")
        .update({ comments: JSON.parse(jsonFormattedComments)}) // Parse back to object for Supabase
        .eq("id", id)
        .select();

    if (updateError) {
        console.error("Error updating comments:", updateError);
        throw new Error("Failed to update comments");
    }

    if (!data) {
        console.warn("Update succeeded but no rows returned");
        return null;
    }

    return data[0]; // Return the updated row
}

export const getCurrentUserEmail = async () => {
    const { data, error } = await supabase.auth.getUser();

    if (error) {
        console.error("Failed to fetch current user:", error);
        return null;
    }

    return data?.user?.email || null;
};

/*

- [ ] get all interviews for a set candidate


For algo 
- [ ] add an interview 
*/


export const createInterview = async (interviewData: {
    time: string;
    location: string;
    type: string;
    comments: string;
    job: string;
    applicant: string;
    interviewer: string;
}) => {
    const { data, error } = await supabase
        .from("interviews") 
        .insert([
            {
                created_at: new Date().toISOString(), // Current timestamp
                time: interviewData.time,
                location: interviewData.location,
                type: interviewData.type,
                comments: interviewData.comments,
                job: interviewData.job,
                applicant: interviewData.applicant,
                interviewer: interviewData.interviewer
            }
        ]);

    if (error) {
        console.error('Error creating interview:', error);
        throw new Error('Failed to create interview in Supabase');
    }
    console.log(data);
    return data;
}