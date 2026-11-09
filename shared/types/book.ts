export interface BookDto {
    id: string
    title: string
    author: string
    owner_id: string
    visibility: 'public' | 'private'
    created_at: string
}

export interface CreateBookBody {
    title: string
    author: string
    visibility: 'public' | 'private'
}