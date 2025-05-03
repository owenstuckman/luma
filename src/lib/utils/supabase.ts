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

export const addComment = async (id: number, newID: number, comment: string, email: string, decision: string) => {
    // Fetch the current applicant data
    const { data: applicantData, error: fetchError } = await supabase
        .from("applicants")
        .select('*')
        .eq('id', id)
        .single();

    if (fetchError) {
        console.error('Error fetching applicant data:', fetchError);
        throw new Error('Failed to fetch applicant data from Supabase');
    }

    console.log(applicantData);
    // Prepare the new comment object
    const newComment = {
        id: newID, 
        email: email,
        comment: comment,
        decision: decision,
    };

    // Convert existing comments to the desired JSON format
    const existingComments = Array.isArray((applicantData.comments).comments) ? (applicantData.comments).comments : [];
    const updatedComments = {
        comments: [...existingComments, newComment]
    };
    console.log(updatedComments);

    // Update the applicant with the new comments array using the correct JSON update syntax
    const { data, error } = await supabase
        .from("applicants")
        .update({ comments: updatedComments })
        .eq('id', id);


    if (error) {
        console.error('Error updating applicant comments:', error);
        throw new Error('Failed to update applicant comments in Supabase');
    }
    console.log(data);
    return data;
}

export const getCurrentUserName = async () => {
    const name = await supabase.auth.getUser.name.toString;
    console.log(name);
    return name.toString;
}